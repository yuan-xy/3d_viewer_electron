# 文件缩略图预览 — 技术实现方案

## 概述

在右侧文件列表中增加"启用预览"模式：开启后每个文件显示 3D 模型缩略图；关闭后保持现有纯文本列表。缩略图自动生成并缓存到 IndexedDB，可通过缓存管理界面清除。

---

## 1. 新增 `enablePreview` 设置项

### 1.1 UI Store (`src/renderer/stores/ui-store.ts`)

在 `UIStore` interface 中新增：

```ts
enablePreview: boolean
setEnablePreview: (v: boolean) => void
```

- 默认值 `false`
- 加入 `persist.partialize`，key 为 `faicad-ui`，和 theme/language 一起持久化到 localStorage

### 1.2 Settings Dialog (`src/renderer/components/settings/SettingsDialog.tsx`)

在 **Theme 区域之后、Language 区域之前**插入新的 `SettingSection`：

```
[Theme]   →  现有
[Preview] →  新增：一个开关按钮（Switch / Toggle）
[Language] → 现有
```

- 标签文案：中文 "启用预览" / 英文 "Enable Preview"
- 使用 Radix UI 的 `Switch` 组件（项目中已有 `src/renderer/components/ui/switch.tsx`）
- 调用 `useUIStore.setEnablePreview()`

### 1.3 国际化

在对应的 i18n JSON 文件中增加 key：
- `settings.enablePreview`: "启用预览" / "Enable Preview"

---

## 2. 缩略图缓存模块

新建目录 `src/renderer/lib/thumbnail-cache/`，包含两个文件：

### 2.1 `thumbnailCache.ts` — IndexedDB 持久化

仿照现有 `src/renderer/lib/step-converter/stepCache.ts` 的模式：

```
Database:  thumbnail-cache
Version:   1
Store:     thumbnails
Key:       filePath|mtimeMs  （与 STEP 缓存使用相同的 key 规范）
Value:     Blob（PNG 格式，尺寸 200×150 左右）
```

导出的函数：
- `getThumbnail(key: string): Promise<Blob | null>`
- `putThumbnail(key: string, blob: Blob): Promise<void>`
- `clearThumbnailCache(): Promise<void>`
- `getAllThumbnailKeys(): Promise<string[]>` — 供 CacheManager 使用
- 内存 LRU Map（容量 ~200 条）作为一级缓存，避免重复读 IndexedDB

### 2.2 `thumbnailGenerator.ts` — 离屏渲染生成缩略图

**核心思路**：在 renderer 进程中创建一个隐藏的 `<canvas>` 元素，配合独立的 `THREE.WebGLRenderer`，加载模型后渲染一帧并导出为 PNG Blob。

**流程**：

1. 创建隐藏 canvas（尺寸 200×150），获取 webgl2 上下文
2. 创建 `THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true })`
3. 构造最小场景：AmbientLight + DirectionalLight + 灰色背景
4. 调用已有的 `loadFormat(buffer, format)` 加载模型，获取 meshes
5. 计算所有 mesh 的包围盒，自适应相机位置（从前方 45° 角俯视）
6. `renderer.render(scene, camera)`
7. `canvas.toBlob('image/png')` 获取 PNG Blob
8. 清理：dispose geometries/materials/textures/renderer

**特殊处理**：
- **STEP 文件**：优先等待 pre-cache（已有的 STEP→GLB 预转换），转换完成后从 GLB buffer 生成缩略图，避免重复转换。如果 pre-cache 尚未完成，跳过该文件稍后重试。
- **GLB/glTF 文件**：直接解析并渲染
- **超大文件**：设置解析超时（15 秒），超时则跳过该文件
- **生成失败**：不崩溃，仅跳过该文件（无缩略图时显示默认图标）

**资源回收**：渲染器为单例复用，模型加载后 dispose 所有资源，避免 GPU 内存泄漏。

---

## 3. 缩略图预加载队列

### 3.1 `ThumbnailQueue` 类

新建 `src/renderer/lib/thumbnail-cache/thumbnailQueue.ts`：

- 单生产者、单消费者串行队列
- 每次只处理一个文件（避免并发 WebGL 上下文冲突）
- 两个优先级：
  - **可见优先**：当前滚动视口内的文件优先生成
  - **后台预生成**：视口外的文件按列表顺序依次处理
- 每个文件处理完成后间隔 200ms 再处理下一个（避免阻塞 UI 渲染）
- 当文件夹切换时，清空队列并重新开始
- 使用 `requestIdleCallback`（fallback: `setTimeout`）调度

### 3.2 与 FileListPanel 集成

- FileListPanel 挂载后，等 `folderFiles` 填充完毕 → 将全部文件入队（后台优先级）
- 使用 `IntersectionObserver` 监听列表项：进入视口的文件提升为可见优先级
- 队列每处理完一个文件，通过回调通知 FileListPanel 更新对应项的缩略图 URL

### 3.3 与现有 STEP Worker Pool 的关系

缩略图队列与 STEP worker pool（`stepWorkerPool.ts`）是**两套独立机制，不共用 worker**。

**为什么独立？**

| | STEP Worker Pool | 缩略图队列 |
|---|---|---|
| 工作负载 | CPU 密集型（OCCT WASM） | GPU 密集型（WebGL 渲染） |
| 运行环境 | Web Worker（无 DOM） | 主线程（需要 DOM Canvas + Three.js loaders） |
| 输入 | STEP/STP 二进制 | 任意 3D 格式的 ArrayBuffer |
| 输出 | GLB ArrayBuffer | PNG Blob |
| 缓存 | IndexedDB `step-glb-cache` | IndexedDB `thumbnail-cache` |

缩略图生成无法放入 Web Worker，因为需要调用 `loadFormat()` → Three.js loaders（依赖 `Image`、`FileReader`、`DOMParser` 等 DOM API），且需要 WebGL 渲染上下文。

**唯一交集 — STEP 文件的缩略图生成**：

```
STEP 预缓存链路（独立运行）：
  preCache.ts → stepWorkerPool.ts (Web Worker ×3) → stepCache.ts (IndexedDB)

缩略图链路（独立运行）：
  thumbnailQueue.ts → thumbnailGenerator.ts → thumbnailCache.ts
                           │
                           │ 对非 STEP 格式：直接调用 loadFormat() 加载并渲染
                           │ 对 STEP 格式：  等待 pre-cache 完成 → 从 stepCache 读 GLB → 渲染
                           └─────────────────────────────────────────────────
```

- 缩略图队列在处理 STEP 文件时，先检查 `stepCache` 是否已有转换好的 GLB——有就直接渲染，没有则跳过（等 pre-cache 完成后再重试）
- 两者共享同一个缓存 key 规范（`filePath|mtimeMs`），但读写不同的 IndexedDB 数据库
- 互不阻塞：pre-cache 失败不影响缩略图队列处理其他格式，反之亦然

---

## 4. FileListPanel 改造

### 4.1 双模式渲染

从 `useUIStore` 读取 `enablePreview`：

- **`enablePreview = false`**：保持现有文本列表渲染，无任何变化
- **`enablePreview = true`**：切换到缩略图网格布局

### 4.2 缩略图网格布局

- 使用 CSS Grid（`grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))`），间距 `gap-2`
- 每个卡片 `rounded-lg overflow-hidden`，整体为一个正方形比例区域（宽高比 ~4:3）

**卡片三种视觉状态：**

#### 状态 A：缩略图已就绪
- 显示真实 3D 缩略图图片，撑满卡片
- 文件名以半透明浮层叠在底部（`bg-black/50 text-white text-xs truncate`），避免遮挡模型
- 当前选中/加载中的文件：卡片外圈 ring 高亮

#### 状态 B：缩略图生成中（占位状态）
- 卡片使用一个纯 CSS 渐变背景作为底图——微妙的对角线网格纹理（`repeating-linear-gradient` 模拟 3D 视口网格地面效果），深灰底色，不依赖任何外部图片
- 在此背景上居中叠加两层文字：
  - **第一行**：格式扩展名彩色徽章（复用 `EXT_COLORS`，字号 `text-base font-bold`，用半透明底色圆角 pill 包裹）
  - **第二行**：文件名（`text-xs text-muted-foreground`，单行截断，max-width 撑满卡片宽度减 padding）
- 整体效果类似文件管理器的预览占位——有质感但不抢眼，用户一眼能分辨文件类型和名称

#### 状态 C：生成失败（无缩略图）
- 与状态 B 使用相同的背景和文字布局
- 额外在右上角叠加一个微小图标（`AlertCircle` 或类似，`text-muted-foreground/60`）表示缩略图不可用
- 不影响文件正常点击加载

**加载过渡**：
- 状态 B → 状态 A 使用 CSS `opacity` 淡入过渡（`transition-opacity duration-300`），避免突兀跳变

**选中/当前文件状态**：
- 当前加载的模型文件：卡片外圈 `ring-2 ring-primary` 高亮
- 鼠标 hover/选中：`ring-1 ring-primary/50` + 轻微 scale 变化

### 4.3 缩略图状态管理

在 FileListPanel 组件内部使用 `useRef<Map<string, string>>` 存储 `filePath → objectURL` 映射：

- 缩略图生成完成后，将 Blob 转为 `URL.createObjectURL(blob)` 存入 map
- 通过递增 `version` state 触发重渲染
- 组件卸载时 `URL.revokeObjectURL` 清理所有 objectURL

不将缩略图 URL 存入 Zustand store（避免序列化问题，缩略图状态与 UI 生命周期绑定）。

---

## 5. CacheManager 改造

### 5.1 显示缩略图缓存

在现有 STEP 缓存（内存 + IndexedDB）展示的基础上，增加缩略图缓存分区：

- 从 `thumbnailCache` 读取所有 key
- 显示每个缩略图缓存条目：文件路径、修改时间、图片尺寸
- 和 STEP 缓存条目使用相同的 UI 组件（checkbox + 路径 + 时间 + 大小）

### 5.2 清除逻辑

- "清除选中"：同时支持清除 STEP 缓存条目和缩略图缓存条目
- "清除全部"：依次调用 `clearStepCache()` 和 `clearThumbnailCache()`
- 清除后重新加载条目列表

---

## 6. 文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/renderer/stores/ui-store.ts` | 修改 | 新增 `enablePreview` 状态 + setter |
| `src/renderer/components/settings/SettingsDialog.tsx` | 修改 | 在 Theme 和 Language 之间插入 Preview 开关 |
| `src/renderer/lib/thumbnail-cache/thumbnailCache.ts` | 新建 | IndexedDB 缓存 CRUD |
| `src/renderer/lib/thumbnail-cache/thumbnailGenerator.ts` | 新建 | 离屏 Three.js 渲染生成缩略图 |
| `src/renderer/lib/thumbnail-cache/thumbnailQueue.ts` | 新建 | 串行队列，调度缩略图生成 |
| `src/renderer/components/FileListPanel.tsx` | 修改 | 双模式渲染 / 网格布局 / 缩略图显示 |
| `src/renderer/components/CacheManager.tsx` | 修改 | 增加缩略图缓存展示和清除 |
| `src/renderer/i18n/locales/zh.json` | 修改 | 新增中文翻译 key |
| `src/renderer/i18n/locales/en.json` | 修改 | 新增英文翻译 key |

---

## 7. 边界情况与性能考量

| 场景 | 处理 |
|---|---|
| 文件夹包含数百个文件 | 串行队列 + 200ms 间隔，不影响 UI 交互 |
| 用户在生成过程中切换文件夹 | 清空队列，重新入队新文件夹的文件 |
| 文件被外部修改（mtime 变化） | 缓存 key 包含 mtimeMs，自动 miss → 重新生成 |
| STEP 文件 pre-cache 未完成 | 跳过，待 pre-cache 完成后补生成 |
| WebGL 上下文丢失 | 重建渲染器，当前缩略图标记失败 |
| 超大模型导致生成超时 | 15s 超时，跳过该文件，显示格式标签 |
| 内存压力 | LRU 内存缓存上限 200 条 + dispose 每帧资源 |
| 窗口最小化/隐藏 | 暂停队列，`document.hidden` 时停止，恢复后继续 |
| 缩略图缓存与 STEP 缓存的总磁盘占用 | CacheManager 统一展示，用户可选择性清除 |

---

## 8. 不做什么

- 不支持视频/动画预览（仅静态缩略图）
- 不在主 3D 画布中复用缩略图渲染（独立隐藏 canvas）
- 不将缩略图传给 main process（全部在 renderer 进程内完成）
- 不提供缩略图尺寸/角度自定义（固定 200×150，固定 45° 视角）
