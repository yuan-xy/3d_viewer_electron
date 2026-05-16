# Ficad Web Electron 桌面应用

独立的本地 3D 模型文件查看器桌面应用，支持 STL/GLB/3MF/STEP/STP 格式文件浏览和渲染。

## 功能

- **3D 模型渲染**：基于 PBR 和光照/材质系统
- **拖拽上传**：直接将 3D 文件拖入窗口即可加载
- **点击上传**：点击上传按钮选择文件
- **文件列表**：加载文件后自动扫描同目录下的所有 3D 模型
- **键盘切换**：使用 ↑↓ 键选择文件，Enter 键加载
- **鼠标切换**：点击文件列表中的文件即可切换
- **模型下载**：将当前模型下载为 STL 或 GLB 文件
- **中英文切换**：支持简体中文和英文界面
- **暗色/亮色主题**：自动跟随系统或手动切换

## 环境要求

- Node.js 20+
- Windows 10/11 x64

## 开发模式

```bash
cd C:\my\Ficad\ficad_web_electron
npm install
npm run dev
```

## 生产构建

```bash
# 构建渲染进程 + 主进程 + preload
npm run build

# 打包为 Windows 便携版（dist/win-unpacked/）
npm run build:unpacked

# 打包为 NSIS 安装程序（dist/）
npm run build:win
```

## 项目结构

```
ficad_web_electron/
├── electron/
│   ├── main/index.ts      # 主进程：窗口管理、协议处理、文件系统 IPC
│   └── preload/index.ts  # 预加载：contextBridge API
├── src/renderer/         # 渲染进程源码（从 ficad_web 迁移）
│   ├── components/       # 组件
│   ├── engine/           # 3D 引擎组件
│   ├── hooks/            # React hooks
│   ├── layouts/          # 布局组件
│   ├── locales/          # 翻译文件
│   ├── pages/            # 页面组件
│   ├── stores/           # Zustand 状态管理
│   └── types/            # TypeScript 类型定义
├── out/                  # electron-vite 构建产物
├── dist/                 # electron-builder 打包产物
│   └── win-unpacked/
│       └── Ficad Web.exe # 可直接运行的可执行文件
├── package.json
├── electron.vite.config.ts
└── tsconfig.json
```

## 功能验证清单

启动应用后验证：

- [ ] 3D 视图正常渲染（WebGL）
- [ ] 文件拖拽上传正常
- [ ] 文件点击上传正常
- [ ] 文件列表显示同目录 3D 模型
- [ ] 键盘 ↑↓ 移动选择，Enter 加载
- [ ] 鼠标点击切换文件
- [ ] 模型下载正常
- [ ] 语言切换（中/英）
- [ ] 主题切换（暗色/亮色）

## 技术栈

- **前端框架**：React 19 + TypeScript
- **3D 渲染**：Three.js + React Three Fiber + Drei
- **UI 组件**：Radix UI + TailwindCSS
- **状态管理**：Zustand
- **桌面框架**：Electron 35 + electron-vite
- **打包工具**：electron-builder

## 已知问题

- 应用图标尚未设置（使用 Electron 默认图标）