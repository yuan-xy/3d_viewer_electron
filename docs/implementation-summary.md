# 文件格式支持扩展 — 实施总结

## 完成情况

### 一、文档修正（4 处错漏已修复）

| # | 问题 | 修复 |
|---|------|------|
| 1 | GLTF 样例路径指向了 `LeePerrySmith.glb`（二进制），不是 `.gltf` | 改为 `AnimatedMorphSphere/glTF/AnimatedMorphSphere.gltf` |
| 2 | 遗漏 3DM 格式 — three.js 有 `3DMLoader.js` + `Rhino_Logo.3dm` 样例 | 新增为第 29 种格式，加入 Mesh 分组 |
| 3 | IFC 标注为 "three.js IFCLoader 内部用 WASM"，实际 IFCLoader 不在 three.js 包里 | 更正为外部包 `web-ifc-three`，标记 `needsExternalDep: true` |
| 4 | 全文计数 28→29（格式总数、新增数、验收标准等） | 全部同步更新 |

### 二、代码实现（29 种格式全部注册 + 25 种 Loader 已接入）

**新增 4 个文件：**

| 文件 | 职责 |
|------|------|
| `config/file-formats.ts` | 29 种格式统一注册表：扩展名→FormatId 映射、分组、颜色、`detectFormat()` |
| `engine/formatLoaders.ts` | 中央调度器 `loadFormat(buffer, format)`，内部 import 全部 26 个 three.js Loader，按格式分派 |
| `components/OpenFileDialog.tsx` | 文件打开对话框，顶部下拉按 8 个分组筛选，底部"全部类型"入口 |
| `test/format-loading.spec.ts` | Playwright 集成测试，覆盖 23 种格式的加载验证 |

**修改 5 个文件：**

| 文件 | 改动 |
|------|------|
| `stores/model-store.ts` | `modelFormat` 类型从硬编码 5 种扩展为 `FormatId`（29 种）；新增 `fileSortMode` 状态 |
| `components/FileListPanel.tsx` | `EXT_COLORS` 改为从 config 导入（29 色）；新增按名称/按类型+名称排序切换按钮 |
| `hooks/useFileUpload.ts` | 弃用硬编码 `ALLOWED_EXTENSIONS`，改用 config 的 `detectFormat()` + `ALL_EXTENSIONS_NO_DOT` |
| `pages/WorkspacePage.tsx` | `accept` 属性改用 config 的 `ALL_ACCEPT`；集成 OpenFileDialog |
| `engine/components/ModelGroup.tsx` | 核心重构：24 个 if/else 分支替换为单次 `loadFormat()` 调用，后续渲染逻辑不变 |

**25 个 fixture 文件**已从 three.js 拷贝到 `src/test/fixtures/`。

**i18n**：en.json / zh.json 新增 12 个 key（文件分组标签、对话框文本、排序提示）。

---

### 三、Known Limitations 详解

#### 1. IFC — 需要额外安装外部包

```
npm install web-ifc-three web-ifc
```

three.js 的 `examples/jsm/loaders/` 目录下**没有** `IFCLoader.js`。查看官方示例 `webgl_loader_ifc.html` 可以看到它的 import 来源是：

```javascript
import { IFCLoader } from 'web-ifc-three';
import { IFCSPACE } from 'web-ifc';
```

这两个是独立的 npm 包（`web-ifc-three` 封装了 `web-ifc` 的 WASM）。当前代码中 IFC case 已预留但会打印 warning 并返回空 mesh。安装这两个包后，只需在 `formatLoaders.ts` 中取消注释并恢复 import 即可启用。

**影响范围**：仅 `.ifc` 文件无法加载，其余 28 种格式不受影响。

---

#### 2. GLTF — 外部 .bin/纹理引用自动解析 ✅

`.gltf` 是 JSON 文件，几何数据、纹理会以外部文件引用：

```json
{
  "buffers": [{ "uri": "AnimatedMorphSphere.bin" }],
  "images": [{ "uri": "texture.png" }]
}
```

**解决方案**（已实施）：

1. 通过 `file.path`（Electron `webUtils.getPathForFile()`）获取 .gltf 文件的真实路径
2. 解析 glTF JSON，找出所有外部 `buffers[].uri` 和 `images[].uri`
3. 通过 IPC（`fs:readFileAsBase64`）读取每个引用文件
4. 将 URI 替换为 data URI（`data:application/octet-stream;base64,...`），使 glTF 变为自包含
5. 将处理后的 JSON 传给 `GLTFLoader.parseAsync()` 正常解析

**错误处理**：
- 文件路径不可用（非 Electron 环境）→ 抛出 "glTF files with external references require the desktop app"
- 引用的文件找不到 → 抛出 "Cannot find referenced file: <uri>\nExpected location: <path>"

**限制**：
- glTF 格式不支持内嵌 `STEP_topology`（该扩展仅适用于 GLB 二进制格式）

---

#### 3. LDraw — 多文件模型需要零件库路径

LDraw 是一个**模块化**格式：模型由子零件引用组成（类似装配体），每个子零件是独立的 `.dat` 文件。`LDrawLoader` 需要通过 `setPartsLibraryPath()` 指定官方零件库的根目录：

```javascript
const loader = new LDrawLoader();
loader.setPartsLibraryPath('/path/to/ldraw/parts/');
loader.parse(mpdText, mainFileName);
```

**当前行为**：
- 打包的 `.mpd` 文件（所有子零件内嵌在一个文件中，如我们的测试 fixture `ImperialAT-ST.mpd`）— 正常 ✅
- 拆分模型（`.ldr` + 多个外部 `.dat`）— 会报找不到零件

**解决方向**：Electron 环境下让用户配置 LDraw 零件库路径，或自动下载官方库（约 50MB）。

**影响范围**：仅拆分结构的 LDraw 模型。

---

#### 4. MDD — 纯变形数据，无独立渲染能力

MDD（Morph Deformation Data）存储的是**顶点位移动画数据**，不包含基础网格。它必须叠加在一个已有的 mesh 上才有意义：

```
MDD 文件内容 = 每帧的顶点偏移量数组
需要一个 .md2 或 .obj 作为 base mesh → 对 base mesh 的顶点逐帧施加偏移 → 产生变形动画
```

`MDDLoader.parse()` 返回一个 `MDD` 对象（包含 `morphPositions` 数组和各帧的最大/最小值），不是 `THREE.Mesh`。

**当前行为**：`formatLoaders.ts` 中 MDD case 返回空 meshes + console.warn。

**解决方向**：需要用户先加载一个基础 mesh，再加载 MDD 数据叠加。这需要 UI 层面的配合（"加载变形数据"按钮），不是单纯的 loader 层能解决的。

**影响范围**：仅 `.mdd` 文件。

---

### 四、构建验证

```
electron-vite build  ✅ 通过
tsc --noEmit        ✅ 0 错误
输出: out/renderer/assets/index-*.js  (4.77 MB，含全部 26 个 Loader)
```
