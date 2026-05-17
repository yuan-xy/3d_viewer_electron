# STEP→GLB Worker 架构设计

## 背景

当前 STEP→GLB 转换在主线程上通过同步 WASM 调用执行（`occt.ReadStepFile()` + `buildGlb()`）。转换期间（1-5 秒）UI 完全冻结。Loading 动画需要同步 DOM 操作 hack（`document.getElementById().style.display`），因为 React 在 WASM 阻塞主线程时无法提交渲染。

两个目标：

1. **将 WASM 转换移至 Web Worker**：异步执行，不阻塞 UI 线程。Loading 动画通过正常的 React 状态管理即可工作。
2. **自动预缓存**：模型加载完成且文件列表填充后，自动在后台转换未被缓存的 STEP 文件。之后点击这些文件可即时加载（缓存命中）。

---

## occt-import-js 的 Worker 兼容性分析

`occt-import-js.cjs` 文件头部（已验证）：

```javascript
var ENVIRONMENT_IS_WEB = typeof window == "object";
var ENVIRONMENT_IS_WORKER = typeof importScripts == "function";
var ENVIRONMENT_IS_NODE = typeof process == "object" && typeof process.versions == "object" 
  && typeof process.versions.node == "string" && process.type != "renderer";
```

关键发现：
- **已内置 Worker 环境检测**：通过 `typeof importScripts == "function"` 判断是否在 Worker 中运行
- 在 Worker 环境下：`scriptDirectory = self.location.href`，不使用 DOM API
- **必须使用 Classic Worker**（不能是 ES Module Worker），因为 `importScripts()` 仅在 classic worker 中可用

`GlbBuilder` 和 `topologyExt` 的依赖检查：
- `GlbBuilder.ts`：无任何 DOM/Window 依赖，纯 JS 逻辑（glTF 二进制构建）
- `topologyExt.ts`：无任何 DOM/Window 依赖，纯数据结构操作
- 两者都可以在主线程或 Worker 中运行，没有限制

---

## 核心架构：Worker 只做 ReadStepFile

```
┌──────────────────────────────────────────────────────────┐
│                      主线程 (UI)                          │
│                                                          │
│  用户点击 STEP 文件                                        │
│       │                                                  │
│       ▼                                                  │
│  ┌─────────────────┐                                    │
│  │ stepToGlbCached │  检查缓存链                          │
│  └────────┬────────┘                                    │
│           │                                              │
│     ┌─────┴─────┐                                        │
│     │ 内存缓存？  │──是──▶ 即时返回                        │
│     └─────┬─────┘                                        │
│           │ 否                                           │
│     ┌─────┴─────┐                                        │
│     │IndexedDB？│──是──▶ 返回 + 回填内存缓存               │
│     └─────┬─────┘                                        │
│           │ 否                                           │
│           ▼                                              │
│  ┌──────────────────┐                                   │
│  │convertInWorker() │──▶ postMessage ──────────────────┐ │
│  └──────────────────┘                                  │ │
│           ▲                                            │ │
│           │ onmessage                                  │ │
│           │                                            │ │
│  ┌────────┴─────────┐                                  │ │
│  │    buildGlb()    │  GLB 构建（TypeScript）           │ │
│  └────────┬─────────┘                                  │ │
│           │                                            │ │
│           ▼                                            │ │
│  ┌──────────────────┐                                  │ │
│  │ 缓存 + 渲染模型   │                                  │ │
│  └──────────────────┘                                  │ │
└──────────────────────────────────────────────────────────┘
                         │
                         │ postMessage({ stepData })
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│                     Web Worker                            │
│                                                          │
│  ┌──────────────────┐                                   │
│  │ importScripts()  │  加载 occt-import-js.cjs          │
│  └────────┬─────────┘                                   │
│           │                                              │
│           ▼                                              │
│  ┌──────────────────┐                                   │
│  │ 初始化 WASM 模块  │  fetch WASM 二进制                 │
│  └────────┬─────────┘                                   │
│           │                                              │
│           ▼                                              │
│  ┌──────────────────┐                                   │
│  │ ReadStepFile()   │  **同步 WASM 调用**（阻塞 Worker   │
│  │                  │   但不影响主线程）                   │
│  └────────┬─────────┘                                   │
│           │                                              │
│           ▼                                              │
│  ┌──────────────────┐                                   │
│  │  返回 {root,     │  原始网格数据（Transferable）       │
│  │   meshes}        │                                   │
│  └──────────────────┘                                   │
└──────────────────────────────────────────────────────────┘
```

**为什么选择这个架构**：Worker 只负责阻塞性的 WASM 操作（`ReadStepFile`），它返回原始的 `{ root, meshes }` 数据。然后主线程使用现有的 TypeScript 代码运行 `buildGlb()`。这样避免了 Worker 中的代码重复，`GlbBuilder`、`topologyExt` 和所有 GLB 构建逻辑仍保留在 TypeScript 中，享有完整的类型检查和工具支持。

---

## 方案对比：Option A vs Option B

### 方案 A：将所有 GLB 构建逻辑移植到 Worker

Worker 中完成完整流程：`ReadStepFile` + `buildGlb` → 从 Worker 返回最终的 GLB `ArrayBuffer`

```
Worker 侧：
  importScripts → initWasm → ReadStepFile → buildGlb → 返回 GLB buffer

主线程侧：
  发送 stepData → 等待 → 接收 GLB buffer → 缓存 → 渲染
```

**优点：**
- 主线程代码最简：发送 STEP 数据，接收 GLB buffer，仅此而已
- 主线程无需导入 GlbBuilder / topologyExt（减小主 bundle）
- 数据传输一次即可（只需传回最终的 GLB buffer）

**缺点（根本问题：classic worker 与 ES module 的冲突）：**

TypeScript 编译为 JavaScript 是没问题的。问题在于模块系统的运行时不兼容：

```
occt-import-js 的需求：    importScripts() → 必须是 classic worker
现有 TypeScript 代码：     import/export   → ES module 语法
classic worker：          不支持 import/export
```

两件事互相矛盾：
1. occt-import-js 使用 `importScripts()` 加载，**只能在 classic worker 中运行**（ES module worker 中没有 `importScripts`）
2. `GlbBuilder.ts`、`topologyExt.ts` 使用 ES `import`/`export` 语法，**classic worker 不支持 ES module 导入**

因此，即使 TypeScript 能正常编译为 JS，要让同一份代码在 classic worker 中运行，也必须解决模块系统不兼容的问题。可选方案：

- **方案 A1 — 手动串联打包**：编写构建脚本，将 `GlbBuilder.ts`、`topologyExt.ts` 编译后的 JS 串联为单一 IIFE 文件，手动管理依赖顺序。这本质上是手工做打包器的工作，脆弱且难以维护。
- **方案 A2 — 配置 Vite 单独构建一个 classic worker bundle**：在 `electron.vite.config.ts` 中额外配置一个 classic worker 入口，让 Vite 将所有依赖打成一个无 ES module 的 bundle。electron-vite 对 classic worker 的支持不明确，需要大量配置探索。
- **方案 A3 — 接受代码重复**：在 `step-worker.js` 中用纯 JS 手写 `buildGlb` 逻辑，与 TypeScript 版本独立维护。这就是我之前说的"重写"——不是因为 TS 不能编译，而是为了避免构建配置的复杂性而选择手动复制。

以上三个子方案的共同问题：`buildGlb` 的逻辑在两个地方存在（TypeScript 源码 + Worker bundle 或手写 JS），bug 修复需要双端同步，类型安全丢失。

- 构建复杂度：无论选 A1/A2/A3，都需要引入额外的构建步骤或代码复制，增加项目复杂度
- 类型安全丢失：Worker 中的代码脱离了 TypeScript 类型系统，`OcctMesh`、`OcctNode` 等接口变更时没有编译时检查
- 调试困难：Worker 中的错误堆栈与 TypeScript 源码失去映射关系
- 测试困难：Worker 内部的 GLB 构建逻辑无法用标准测试框架导入和测试

### 方案 B（推荐）：Worker 只运行 ReadStepFile，buildGlb 保留在主线程

Worker 只返回原始的 `{ root, meshes }`。主线程运行 `buildGlb`。

```
Worker 侧：
  importScripts → initWasm → ReadStepFile → 返回 { root, meshes }

主线程侧：
  发送 stepData → 等待 → 接收 { root, meshes } → buildGlb → 缓存 → 渲染
```

**优点：**
- 零代码重复：Worker 仅包含 OCCT 加载和 `ReadStepFile` 调用（~40 行 JS）
- 单一数据源：`GlbBuilder`、`topologyExt`、`stepToGlb` 的所有代码保持在 TypeScript 中，在 `src/renderer/lib/step-converter/` 下
- 完整的 TypeScript 工具链支持：类型检查、自动补全、重构、源映射
- 可测试：`buildGlb`、`GlbBuilder`、`topologyExt` 仍然可以独立进行单元测试
- 更易于调试：任何 GLB 构建错误都会产生正确的 TypeScript 源映射，直接指向源代码
- Worker 脚本最小化：`step-worker.js` 极短，易于理解和维护
- Worker 初始化快：更少的代码 = 更快的 `importScripts` 完成时间

**缺点：**
- 数据传输两次：Worker 返回的网格数据（positions、normals、indices 的 Float32Array/Uint32Array）必须从 Worker 传输到主线程。对于大型 CAD 模型，可能是几 MB
- `buildGlb` 仍在主线程运行：对于非常大的模型，`buildGlb`（CPU 密集型的网格处理 + GLB 序列化）仍会短暂阻塞主线程。但对于典型 CAD 文件（< 10万 三角形），这一耗时在 10-50ms 量级，不影响体验

**数据传输分析：**

| 数据项 | 典型大小 | 传输方式 |
|--------|---------|---------|
| `positions`: Float32Array | N×3×4 bytes | Transferable（零拷贝） |
| `normals`: Float32Array | N×3×4 bytes | Transferable（零拷贝） |
| `indices`: Uint32Array | N×4 bytes | Transferable（零拷贝） |
| `brep_faces`: Array | 小（元数据） | 结构化克隆 |
| `root`: OcctNode | 小（树结构） | 结构化克隆 |
| `meshes`: OcctMesh[] | 小（元数据，实际数组用 Transferable） | 结构化克隆 |

利用 Transferable 接口，大型类型化数组以零拷贝方式传输——Worker 失去访问权限，主线程获得所有权，没有内存复制开销。这是此方案可行的关键原因。

**实际数据传输量估算：**

对一个有 100,000 个三角形的典型 CAD 模型：
- Positions：100k × 3 × 4 = ~1.2 MB
- Normals：100k × 3 × 4 = ~1.2 MB（通常省略，面片可从 positions 计算）
- Indices：100k × 4 = ~0.4 MB（假设为 Uint32Array）
- 可传输数组合计：~2.8 MB — 零拷贝，瞬时完成
- 结构化克隆（brep_faces + 节点树）：< 10 KB

### 实测性能数据

测试文件：`Mini注塑模具.stp`（8MB，107 万三角形，53 个网格）

| 阶段 | 耗时 | 占比 |
|------|------|------|
| loadOcct（WASM 脚本加载 + 初始化） | 75ms | 0.2% |
| **ReadStepFile（OCCT WASM 处理）** | **40,508ms** | **97.6%** |
| buildGlb（GLB 构建 + 拓扑提取） | 917ms | 2.2% |
| **总计** | **~41.5s** | 100% |

`buildGlb` 的 917ms 内还包括了 `addStepTopology`（brep_faces 全量处理）。

### 最终选择：方案 B + Worker Pool (size=2)

原因总结：
1. **实测数据决定**：ReadStepFile 占 97.6%，buildGlb 仅 0.9s（含拓扑提取）。把 ReadStepFile 移入 Worker 解决 40s 的 UI 冻结，buildGlb 留在主线程的 0.9s 完全可接受。
2. 方案 A 的根本障碍不是"TS 不能编译为 JS"，而是 **classic worker（occt-import-js 需要）与 ES module（现有代码使用）的运行时冲突**。
3. 方案 B 完全避免了模块系统冲突：Worker 只写 ~40 行纯 JS（无 import），现有 TypeScript 代码保持不变。
4. 数据传输开销为零（Transferable 零拷贝）。
5. **Worker Pool (size=2)**：固定两个 Worker 实例，预缓存和用户操作可并行执行。无需 abort、优先级队列等复杂调度逻辑。

### Worker Pool 设计

```
主线程
  ├─ WorkerPool (容量=2)
  │     ├─ Worker A: 可能正在跑预缓存的 ReadStepFile (40s)     ← 后台
  │     └─ Worker B: 用户点击文件时立即处理 ReadStepFile        ← 前台
  │
  └─ 调度逻辑: acquire() → 分配空闲 Worker → 任务完成后 release()
```

| 场景 | Worker A | Worker B | 用户体验 |
|------|----------|----------|---------|
| 空闲 | — | — | — |
| 预缓存运行中 | ReadStepFile(file1) | — | — |
| 预缓存中 + 用户点击 | ReadStepFile(file1) | ReadStepFile(file2) | 无等待 |
| 双预缓存运行中 + 用户点击 | ReadStepFile(file1) | ReadStepFile(file2) | 等待（罕见） |

每个 Worker 独立持有 WASM 实例（+200MB 堆内存），2 个 Worker 总计 +400MB，在桌面 Electron 应用中完全可接受。

---

## 实现细节

### 1. `src/renderer/public/step-worker.js`（新建）

Classic Web Worker，执行以下操作：

```javascript
// 1. 加载 OCCT 库
importScripts('/wasm/occt-import-js.cjs');

// 2. 获取并初始化 WASM
let occt = null;
let initPromise = null;

function init() {
  if (occt) return Promise.resolve(occt);
  if (initPromise) return initPromise;
  initPromise = fetch('/wasm/occt-import-js.wasm')
    .then(r => r.arrayBuffer())
    .then(wasmBinary => self.occtimportjs({ wasmBinary }))
    .then(m => { occt = m; return m; });
  return initPromise;
}

// 3. 消息处理
self.onmessage = async (e) => {
  const { type, id, stepData, params } = e.data;
  if (type === 'convert') {
    try {
      const m = await init();
      const result = m.ReadStepFile(new Uint8Array(stepData), params);
      if (!result.success) throw new Error('STEP import failed');

      // 提取 Transferable 数组以实现零拷贝传输
      const transferList = [];
      const meshes = result.meshes.map(mesh => {
        const transfers = [];
        if (mesh.attributes.position?.array?.buffer) {
          transfers.push(mesh.attributes.position.array.buffer);
        }
        if (mesh.attributes.normal?.array?.buffer) {
          transfers.push(mesh.attributes.normal.array.buffer);
        }
        if (mesh.index?.array?.buffer) {
          transfers.push(mesh.index.array.buffer);
        }
        transferList.push(...transfers);
        return mesh;
      });

      self.postMessage({ type: 'result', id, success: true, root: result.root, meshes }, transferList);
    } catch (err) {
      self.postMessage({ type: 'result', id, success: false, error: err.message });
    }
  }
};
```

### 2. `src/renderer/lib/step-converter/stepWorkerPool.ts`（新建）

固定大小 2 的 Worker Pool：

```typescript
const POOL_SIZE = 2;

interface PoolWorker {
  worker: Worker;
  busy: boolean;
  initPromise: Promise<void>;
}

const pool: PoolWorker[] = [];
let requestId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function createWorker(): PoolWorker {
  const worker = new Worker('step-worker.js');

  worker.onmessage = (e) => {
    const { type, id, success, root, meshes, error } = e.data;
    const req = pending.get(id);
    if (!req) return;
    pending.delete(id);
    if (success) req.resolve({ root, meshes });
    else req.reject(new Error(error));
    // 标记为空闲
    const pw = pool.find(p => p.worker === worker);
    if (pw) pw.busy = false;
  };

  worker.onerror = (err) => {
    for (const [id, req] of pending) {
      if (pool.some(p => p.worker === worker && p.busy)) {
        req.reject(new Error('Worker error'));
        pending.delete(id);
      }
    }
    // 替换崩溃的 Worker
    const idx = pool.findIndex(p => p.worker === worker);
    if (idx >= 0) pool[idx] = createWorker();
  };

  // 发送一条空消息触发 WASM 初始化
  worker.postMessage({ type: 'init' });

  return { worker, busy: false, initPromise: Promise.resolve() };
}

// 启动时预创建 Pool
for (let i = 0; i < POOL_SIZE; i++) {
  pool.push(createWorker());
}

function acquire(): PoolWorker | null {
  const pw = pool.find(p => !p.busy);
  if (pw) pw.busy = true;
  return pw ?? null;
}

export function convertInWorker(
  stepData: ArrayBuffer,
  params: Record<string, unknown>,
): Promise<{ root: any; meshes: any[] }> {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const pw = acquire();
    if (!pw) {
      // Pool 已满，排队等待（通过轮询，或直接拒绝让调用方稍后重试）
      reject(new Error('All workers busy, retry later'));
      return;
    }
    pending.set(id, { resolve, reject });
    pw.worker.postMessage(
      { type: 'convert', id, stepData, params },
      [stepData],
    );
  });
}
```

### 3. `src/renderer/lib/step-converter/stepToGlbCached.ts`（修改）

将直接调用替换为 Worker：

```typescript
// 之前：
const buffer = await stepToGlb(stepData, options);

// 之后：
const occtParams = {
  linearUnit: 'millimeter',
  linearDeflectionType: 'absolute_value',
  linearDeflection: options.linearDeflection ?? 0.001,
  angularDeflection: options.angularDeflection ?? 0.5,
};
const result = await convertInWorker(stepData, occtParams);
const buffer = buildGlbFromResult(result, options);  // ← 与 stepToGlb 相同的 buildGlb 逻辑
```

### 4. `src/renderer/lib/step-converter/stepToGlb.ts`（修改）

提取 `buildGlb` 为公共函数，以便 Worker 路径可以重用它：

```typescript
// 将 buildGlb 提取为具名导出
export function buildGlbFromResult(
  importResult: { success: boolean; root: OcctNode; meshes: OcctMesh[] },
  options: StepToGlbOptions,
): ArrayBuffer {
  // ... 现有的 buildGlb 逻辑 ...
}
```

### 5. `src/renderer/lib/step-converter/preCache.ts`（新建）

后台预缓存逻辑：

```typescript
import { getCached, putCached } from './stepCache';
import { convertInWorker } from './stepWorkerManager';
import { buildGlbFromResult, type StepToGlbOptions } from './stepToGlb';

const memCache = new Map<string, ArrayBuffer>();  // 共享内存缓存引用
let preCacheRunning = false;

export async function startPreCache(
  files: { name: string; path: string; mtimeMs: number }[],
  wasmPath: string,
): Promise<void> {
  if (preCacheRunning) return;
  preCacheRunning = true;

  const stepFiles = files.filter(f => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    return ext === 'step' || ext === 'stp';
  });

  for (const file of stepFiles) {
    const key = `${file.path.replace(/\\/g, '/')}|${Math.trunc(file.mtimeMs)}`;
    if (memCache.has(key)) continue;

    try {
      const dbHit = await getCached(key);
      if (dbHit) { memCache.set(key, dbHit); continue; }
    } catch { /* IndexedDB 不可用 */ }

    try {
      const result = await window.electronAPI.readFileAsBase64(file.path);
      if (!result.success) continue;

      const binaryString = atob(result.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

      const importResult = await convertInWorker(bytes.buffer, {
        linearUnit: 'millimeter',
        linearDeflectionType: 'absolute_value',
        linearDeflection: 0.001,
        angularDeflection: 0.5,
      });

      const glbBuffer = buildGlbFromResult(importResult, {
        wasmPath,
        includeSelectorTopology: true,
      });

      memCache.set(key, glbBuffer);
      try { await putCached(key, glbBuffer); } catch { /* 尽力而为 */ }
    } catch (err) {
      console.warn('[preCache] failed for', file.name, err);
    }
  }

  preCacheRunning = false;
}
```

### 6. 调用点：触发预缓存

在 `useFileUpload.ts` 中，填充文件列表后：

```typescript
if (result.success && result.files) {
  setFolderFiles(folderPath, result.files);
  // 延迟触发预缓存，优先处理活跃的用户交互
  setTimeout(() => startPreCache(result.files, '/wasm/occt-import-js.wasm'), 500);
}
```

在 `FileListPanel.tsx` 中，添加 effect：

```typescript
useEffect(() => {
  if (folderFiles.length > 0) {
    const timer = setTimeout(() => {
      startPreCache(folderFiles, '/wasm/occt-import-js.wasm');
    }, 500);
    return () => clearTimeout(timer);
  }
}, [folderFiles]);
```

### 7. Loading 动画简化

在 Worker 架构中，`setIsConverting()` 变为纯 React 状态更新：

```typescript
// stores/model-store.ts
setIsConverting: (v) => set({ isConverting: v }),
```

无需再使用 `document.getElementById('step-loading-overlay').style.display` — React 正常渲染 overlay，因为主线程在 Worker 转换期间保持空闲。

---

## 验证清单

1. **Worker 转换**：加载 STEP 文件 → loading 动画出现 → 模型渲染 → 动画隐藏。无 UI 卡顿。
2. **跨重启缓存持久化**：加载 STEP 文件 → 关闭应用 → 重新打开 → 点击同一文件 → IndexedDB 命中 → 即时渲染。
3. **内存缓存**：点击文件 A → 点击文件 B → 再次点击文件 A → 内存命中（即时）。
4. **预缓存**：加载包含 3 个 STEP 文件的文件夹 → 打开文件 A → 等待几秒 → 点击文件 B → 缓存命中（已预转换）。
5. **预缓存不阻塞**：预缓存期间，点击文件 → 立即加载，不会因预缓存队列而延迟。
6. **E2E 测试**：所有 5 个现有测试继续通过。
7. **Loading 动画**：在 STEP→GLB Worker 转换期间验证 overlay 可见性（不再需要同步 DOM hack）。
