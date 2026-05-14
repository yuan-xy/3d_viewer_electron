# Ficad Web Electron 桌面应用

## 使用说明

### 环境要求

- Node.js 20+
- Windows 10/11 x64

### 开发模式

```bash
cd C:\my\Ficad\ficad_web_electron
npm run dev
```

首次运行会自动在 5173 端口启动 ficad_web 的 Vite dev server，然后 Electron 窗口加载该服务。

### 生产构建

```bash
# 构建渲染进程 + 主进程 + preload
npm run build

# 打包为 Windows 便携版（out/win-unpacked/）
npm run build:unpacked

# 打包为 NSIS 安装程序（out/）
npm run build:win
```

### 项目结构

```
ficad_web_electron/
├── electron/
│   ├── main/index.ts      # 主进程：窗口管理、Vite server 启动、IPC
│   └── preload/index.ts   # 预加载：contextBridge API
├── out/                   # electron-vite 构建产物
│   ├── main/index.js
│   ├── preload/index.mjs
│   └── renderer/index.html + assets/
├── dist/                  # electron-builder 打包产物
│   └── win-unpacked/
│       └── Ficad Web.exe  # 可直接运行的可执行文件
├── package.json
├── electron.vite.config.ts
└── tsconfig.json
```

### 功能验证清单

启动 `Ficad Web.exe` 后验证：

- [ ] 3D 视图正常渲染（WebGL）
- [ ] 文件上传（拖拽 + 点击上传 STEP/GLB/STL）
- [ ] 工具栏切换（View / Transform / Modeling / Boolean / Measure）
- [ ] 聊天面板发送消息
- [ ] 撤销/重做（历史记录）
- [ ] 语言切换（中/英）
- [ ] 暗色/亮色主题切换
- [ ] 响应式布局（640px 断点）

### 注意事项

- `/dev/r3f` 路由仅在开发模式（`npm run dev`）下可用
- Vite proxy 配置不适用于 Electron 环境，后端请求通过 Vite dev server 代理，或生产环境自行配置 `VITE_API_BASE_URL`
- 应用图标尚未设置（使用 Electron 默认图标）