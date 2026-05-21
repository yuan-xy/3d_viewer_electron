# 3D Viewer Electron 桌面应用

独立的本地 3D 模型文件查看器桌面应用，支持 24 种 3D 文件格式的浏览和渲染。

## 功能

### 文件加载
- **拖拽上传**：直接将 3D 文件拖入窗口即可加载
- **点击上传**：点击上传按钮，按类别筛选文件格式后选择文件
- **剪贴板粘贴**：从剪贴板粘贴 3D 文件
- **文件列表**：加载文件后自动扫描同目录下所有支持的 3D 模型
- **键盘切换**：使用 ↑↓ 键选择文件，Enter 键加载
- **鼠标切换**：点击文件列表中的文件即可切换

### 3D 渲染与显示
- **PBR 材质系统**：基于物理的渲染，支持金属度/粗糙度工作流
- **5 种显示模式**：实体 / 线框 / 实体+线框 / 网格 / 调试视图
- **多光源系统**：环境光 + 方向光，自适应场景亮度
- **OrbitControls**：带阻尼的旋转/平移/缩放，自动适配模型尺寸

### 交互工具
- **变换工具 (TransformControls)**：平移 / 旋转 / 缩放
- **拓扑选择**：支持对象 / 面 / 边 / 顶点四种选择模式
- **选择高亮**：悬停（白色轮廓）和选中（蓝色轮廓）
- **选择信息面板**：显示选中元素的 ID、类型、面积/长度/坐标

### 模型操作
- **模型下载**：将当前模型下载为 STL 或 GLB 文件
- **场景树**：层次化展示模型部件，支持展开/折叠和单独显隐控制
- **模型统计**：实时显示顶点数、面数、材质重量

### 通用功能
- **中英文切换**：支持简体中文和英文界面，可跟随系统
- **暗色/亮色主题**：支持浅色/深色/跟随系统
- **状态栏**：显示当前模型的顶点、面、材质重量信息
- **XYZ 轴指示器**：右下角实时显示坐标系方向

## 支持的文件格式

### 网格 (Mesh) — 13 种
| 格式 | 扩展名 | 说明 |
|------|--------|------|
| STL | `.stl` | 三角面片网格，支持 ASCII 和 Binary |
| GLB | `.glb` | glTF 2.0 二进制格式 |
| GLTF | `.gltf` | glTF 2.0 JSON 格式，自动解析外部 .bin/纹理引用 |
| 3MF | `.3mf` | 3D Manufacturing Format |
| OBJ | `.obj` | Wavefront OBJ，基于文本 |
| PLY | `.ply` | 支持 ASCII 和 Binary 自动检测 |
| FBX | `.fbx` | Autodesk Filmbox |
| DAE | `.dae` | Collada 格式，基于文本 |
| 3DS | `.3ds` | 3D Studio 旧版格式 |
| USDZ | `.usdz` | Apple 通用场景描述压缩包 |
| DRC | `.drc` | Draco 压缩网格（需 Draco WASM 解码器） |
| AMF | `.amf` | Additive Manufacturing Format |
| LWO | `.lwo` | LightWave 3D 对象格式 |
| 3DM | `.3dm` | Rhinoceros 3D 格式（需 rhino3dm WASM） |

### CAD — 1 种
| 格式 | 扩展名 | 说明 |
|------|--------|------|
| STEP | `.step` `.stp` | 通过 Open CASCADE 引擎转换为 GLB 渲染 |

### 动画 (Animation) — 2 种
| 格式 | 扩展名 | 说明 |
|------|--------|------|
| BVH | `.bvh` | 骨骼动画，以骨架方式渲染 |
| MD2 | `.md2` | Quake II 模型格式 |

### 点云 (Point Cloud) — 3 种
| 格式 | 扩展名 | 说明 |
|------|--------|------|
| XYZ | `.xyz` | 点坐标数据，以点云渲染 |
| PDB | `.pdb` | 蛋白质数据库格式，原子+键渲染为点云+线段 |
| PCD | `.pcd` | Point Cloud Data 格式 |

### 体数据 (Volume) — 2 种
| 格式 | 扩展名 | 说明 |
|------|--------|------|
| VTK | `.vtk` `.vtp` | Visualization Toolkit 格式 |
| NRRD | `.nrrd` | 近原始光栅数据，代理立方体渲染 |

### GCode — 1 种
| 格式 | 扩展名 | 说明 |
|------|--------|------|
| GCode | `.gcode` | 3D 打印刀具路径，渲染为线线段 |

### 其他 — 2 种
| 格式 | 扩展名 | 说明 |
|------|--------|------|
| WRL | `.wrl` | VRML，基于文本 |
| VOX | `.vox` | MagicaVoxel 体素格式 |
| KMZ | `.kmz` | 压缩的 KML，含 3D 模型 |

> **总计：25 种格式**。另有用例受限未启用的格式：IFC (`.ifc`)、MDD (`.mdd`)。

## 环境要求

- Node.js 20+
- pnpm 10+
- Windows 10/11 x64（主要开发平台）
- Linux x64 / macOS (arm64 + x64) 已适配构建，但非主要测试平台

## 开发

```bash
pnpm install
pnpm run dev
```

## 生产构建

```bash
# 构建渲染进程 + 主进程 + preload
pnpm run build

# 打包为 Windows 便携版（dist/win-unpacked/）
pnpm run build:unpacked

# 打包为 NSIS 安装程序（dist/）
pnpm run build:win

# Linux / macOS 构建
pnpm run build:unpacked:linux
pnpm run build:unpacked:mac
```

## 项目结构

```
3d_viewer_electron/
├── electron/
│   ├── main/index.ts          # 主进程：窗口管理、faicad-viewer:// 协议、IPC 处理
│   └── preload/index.ts       # 预加载：contextBridge 暴露 electronAPI
├── src/renderer/              # 渲染进程源码
│   ├── components/            # UI 组件
│   │   ├── viewport/          # 3D 视口（引擎组件、工具栏、选择叠加层等）
│   │   └── settings/          # 设置面板（主题、语言）
│   ├── config/                # 文件格式配置
│   ├── engine/                # 3D 引擎（格式加载器、场景设置）
│   ├── hooks/                 # React hooks
│   ├── i18n/                  # i18next 初始化
│   ├── layouts/               # 桌面布局（顶部栏、面板、视口）
│   ├── lib/
│   │   ├── step-converter/    # STEP→GLB 转换（OCCT WASM + Worker + 缓存）
│   │   └── topology/          # 拓扑选择系统（面/边/顶点）
│   ├── locales/               # 翻译文件（zh.json / en.json）
│   ├── pages/                 # 页面组件
│   ├── stores/                # Zustand 状态管理
│   │   ├── ui-store.ts        # UI 状态（主题、语言、面板）
│   │   ├── model-store.ts     # 模型状态（场景树、统计、文件列表）
│   │   ├── engine-store.ts    # Three.js 引擎引用
│   │   ├── selection-store.ts # 拓扑选择状态
│   │   └── tool-store.ts      # 活动工具模式
│   └── types/                 # TypeScript 类型定义
├── out/                       # electron-vite 构建产物
├── dist/                      # electron-builder 打包产物
│   └── win-unpacked/
│       └── 3D_Viewer.exe      # 可直接运行的可执行文件
├── .github/workflows/ci.yml   # CI 配置（Ubuntu + Windows 矩阵）
├── .npmrc                      # pnpm 配置
├── package.json
├── pnpm-lock.yaml              # 跨平台一致的依赖锁文件
├── electron.vite.config.ts
└── tsconfig.json
```

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Electron + electron-vite | 35 + 3 |
| 前端框架 | React | 19 |
| 3D 渲染 | Three.js + React Three Fiber + Drei | 0.184 + 9 + 10 |
| UI 组件 | Radix UI + TailwindCSS | 4 |
| 状态管理 | Zustand | 5 |
| 国际化 | i18next + react-i18next | 26 |
| 路由 | React Router | 7 |
| 打包 | electron-builder | 26 |
| 包管理 | pnpm | 10 |
| 测试 | Vitest + Playwright | - |
| 语言 | TypeScript | 6 |

## 已知问题

- 应用图标尚未设置（使用 Electron 默认图标）
