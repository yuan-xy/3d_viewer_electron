# Worker Pool 设计：可抢占多 Worker 架构

## 问题分析

当前 2-Worker 方案的竞争场景：

```
时间线 →
Worker A: [████████████ pre-cache file-A 40s ██████████████████████████████]
Worker B: [█████ user click file-B 40s ████████████████████████████████████]

用户点击 file-C → 无 Worker 可用 → 必须等 Worker A 或 B 完成（最多 40s）
```

节点：
1. 用户可随时切换文件，一次点击占用一个 Worker 长达 40s
2. 连续点击 3 个文件就会耗尽 2 个 Worker
3. 预缓存占用 Worker 而无抢占机制，用户等待完全不可控

## 架构设计

### 总览

```
┌─────────────────────────────────────────────────────────────────┐
│                      WorkerPool (size=N)                         │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Worker 0 │  │ Worker 1 │  │ Worker 2 │  │ Worker 3 │  ...N  │
│  │          │  │          │  │          │  │          │        │
│  │ 用户任务  │  │ 用户任务  │  │ 用户任务  │  │ 预缓存   │        │
│  │ 不可抢占  │  │ 不可抢占  │  │ 不可抢占  │  │ 可抢占   │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│       ▲              ▲              ▲              ▲            │
│       │              │              │              │            │
│  ┌────┴──────────────┴──────────────┴──────────────┴──────┐    │
│  │                    调度器 (Scheduler)                    │    │
│  │  - pendingPromises: Map<key, Promise>  ← 去重            │    │
│  │  - 用户请求: 优先分配，必要时抢占预缓存 Worker             │    │
│  │  - 预缓存: 仅使用空闲 Worker，最多 1 个并发               │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 核心机制

#### 1. Promise 去重

同一文件（相同 cacheKey）只转换一次，无论来自预缓存还是用户点击：

```
用户点击 file-A → 创建 Promise-A → 存入 pendingPromises
预缓存 file-A → 查询 pendingPromises → 命中 → await Promise-A（不启动新 Worker）
```

```typescript
// stepWorkerPool.ts
const pendingPromises = new Map<string, Promise<OcctImportResult>>();

async function convert(cacheKey: string, stepData: ArrayBuffer, params: object): Promise<OcctImportResult> {
  // 去重：同一 cacheKey 只转换一次
  const existing = pendingPromises.get(cacheKey);
  if (existing) return existing;

  const promise = doConvert(stepData, params);
  pendingPromises.set(cacheKey, promise);
  promise.finally(() => pendingPromises.delete(cacheKey));
  return promise;
}
```

#### 2. 用户请求调度

```
用户点击文件:
  ┌─ pendingPromises 有 cacheKey 的进行中 Promise？
  │    └─ 是 → await 它（不分用户请求还是预缓存发起的）
  │
  ├─ 有空闲 Worker？
  │    └─ 是 → 分配该 Worker，标记 taskType='user'
  │
  └─ 全部忙碌 → 检查是否有 pre-cache 类型的 Worker？
       ├─ 是 → Worker.terminate() 终止预缓存 Worker
       │        创建新 Worker 分配给用户请求
       │        （被中断的预缓存任务稍后由 preCache scheduler 重新发起）
       │
       └─ 全部是用户任务 → reject("All workers busy")
                            （调用方应显示"转换中，请稍后重试"）
```

#### 3. 预缓存调度

```
预缓存触发:
  ┌─ pendingPromises 有该 cacheKey 的进行中 Promise？
  │    └─ 是 → 跳过（已有进行中的转换）
  │
  ├─ 已有预缓存正在运行？
  │    └─ 是 → 跳过（最多 1 个预缓存并发）
  │
  ├─ 有空闲 Worker？
  │    └─ 是 → 分配该 Worker，标记 taskType='precache'
  │
  └─ 无空闲 → 等待（下次轮询或 Worker 释放时重试）
```

#### 4. 抢占流程

```
用户点击 file-D，所有 Worker 都忙:
  扫描所有 taskType='precache' 的 Worker
    → 找到 Worker-K（正在预缓存 file-X）
    → Worker-K.terminate()
    → 从 pendingPromises 移除 file-X 的 Promise
    → 创建新 Worker 替换 Worker-K
    → 分配新 Worker 给用户 file-D，标记 taskType='user'
  
  预缓存重试:
    → preCache scheduler 感知到 file-X 被中断
    → 等待 1 个空闲 Worker
    → 重新发起 file-X 的预缓存
```

### 参数配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `poolSize` | 3 | Worker 总数。3 是一个合理的默认值：用户最多同时转换 2 个文件（连续快速点击），预缓存占 1 个 |
| `maxPrecacheWorkers` | 1 | 预缓存最大并发数。1 保证至少 poolSize-1 个 Worker 给用户 |

### 场景推演

**场景 1：正常使用（N=3）**
```
Worker 0: [空闲]
Worker 1: [空闲]
Worker 2: [空闲]

用户点击 file-A → Worker 0 [█████████ user file-A █████████]
预缓存启动     → Worker 1 [████████ precache file-B ███████]
用户点击 file-C → Worker 2 [████████ user file-C █████████]
用户点击 file-D → 全部忙，无 precache 可抢占 → reject（提示稍后重试）
```

**场景 2：抢占（N=3）**
```
Worker 0: [████████ user file-A ████████████████████████]
Worker 1: [████ precache file-B ████████████████████████]
Worker 2: [████████ user file-C ████████████████████████]

用户点击 file-D → 全部忙
  → 找到 Worker 1 (precache) → terminate()
  → pendingPromises.delete(file-B)
  → 创建新 Worker 1: [████████ user file-D █████████]
  → 预缓存 file-B 稍后自动重试
```

**场景 3：去重（关键优化）**
```
预缓存 file-A → Worker 1 [████████ precache file-A ███████]

用户点击 file-A → 查询 pendingPromises(file-A) → 命中！
  → await 预缓存发起的 Promise（不启动新 Worker）
  → 预缓存完成 → 用户拿到结果 + 缓存写入
  → 用户感知：已经等了一段时间，可能只需再等几秒
```

**场景 4：多文件切换**
```
用户点击 file-A → Worker 0 [████████ user file-A ████████████████]
2s 后切换 file-B → Worker 1 [████████ user file-B ████████████████]
2s 后切换 file-C → Worker 2 [████████ user file-C ████████████████]
2s 后切换 file-D → 3 个 Worker 全忙
  → 但 Worker 0 的 file-A 已完成（仅 12-triangle 小文件，但大文件可能还在跑）
  → 对于大文件场景：reject，UI 提示"正在转换其它文件，请稍候"
```

**场景 5：预缓存被抢占后重试**
```
precache file-B → Worker 1 [████ precache file-B 被 terminate  ████]
                   ↑ 用户点击 file-D 抢占

preCache scheduler:
  → file-B 的 catch 块捕获 AbortError
  → 等待新 Worker 空闲（当前全忙）
  → Worker 释放 → 重新发起 precache file-B
  → pendingPromises 创建新 Promise
  → 转换完成 → 写缓存
```

### 与现有代码的改动点

#### `stepWorkerPool.ts` — 重写

```typescript
interface WorkerSlot {
  worker: Worker
  busy: boolean
  taskType: 'user' | 'precache' | null
  cacheKey: string | null
}

let workers: WorkerSlot[] = [];
let requestId = 0;
const pending = new Map<number, PendingRequest>();
const pendingPromises = new Map<string, Promise<OcctImportResult>>();

export function convertInWorker(
  cacheKey: string,
  stepData: ArrayBuffer,
  params: Record<string, unknown>,
  priority: 'user' | 'precache' = 'user',
): Promise<OcctImportResult> { ... }
```

关键接口变更：`convertInWorker` 新增 `cacheKey` 和 `priority` 参数。

#### `stepToGlbCached.ts` — 传入 cacheKey

```typescript
// 已有 cacheKey，直接传入
const importResult = await convertInWorker(key, stepBuffer, OCCT_PARAMS, 'user');
```

#### `preCache.ts` — 传入 cacheKey + priority='precache'

```typescript
const importResult = await convertInWorker(key, bytes.buffer, OCCT_PARAMS, 'precache');
// 如果被抢占（Worker terminated），captch AbortError 后重试
```

### 收益总结

| 维度 | 当前 (2 Worker) | 新方案 (N Worker + 抢占) |
|------|-----------------|--------------------------|
| 用户最大并发 | 2（含预缓存占用） | N-1（预缓存自动让位） |
| 同一文件去重 | 无（双份转换） | pendingPromises 去重 |
| 预缓存被抢后 | 不可恢复 | 自动重试 |
| 全部忙碌时 | 无提示等待 | 明确 reject + UI 提示 |
| 扩展性 | 硬编码 2 | 可配置 N，默认 3 |
