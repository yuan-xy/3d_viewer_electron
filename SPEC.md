# Ficad Web Electron 桌面应用规格

## 1. 概述

将 Ficad Web（React + Vite + TypeScript）通过 Electron 打包为 Windows 本地桌面应用程序。保持原有所有功能、UI 和交互逻辑不变，仅增加桌面原生外壳。

**技术栈**：Electron 35 + electron-vite + electron-builder

**输出目录**：`C:\my\Ficad\ficad_web_electron`

---

## 2. 项目结构

```
ficad_web_electron/
├── package.json              # Electron 主进程依赖 + 构建配置
├── electron.vite.config.ts    # electron-vite 构建配置
├── playwright.config.ts       # Playwright E2E 测试配置
├── electron/
│   ├── main/index.ts          # 主进程入口
│   └── preload/index.ts       # 预加载脚本（CJS 格式）
├── dist/win-unpacked/         # 打包输出（便携版）
│   └── Ficad Web.exe          # 可执行文件
└── src/test/app.spec.ts       # Playwright E2E 测试
```

---

## 3. 主进程设计

### 3.1 窗口管理

| 配置项 | 值 | 说明 |
|---|---|---|
| 默认尺寸 | 1280×800 | 首次启动窗口大小 |
| 最小尺寸 | 800×600 | 窗口可缩小的最小值 |
| 标题 | Ficad | 窗口标题栏文字 |
| 背景色 | #ffffff | 窗口背景色 |
| 预加载 | index.js | CJS 格式的预加载脚本 |

### 3.2 安全策略

- `contextIsolation: true`
- `nodeIntegration: false`
- `webSecurity: false`（允许 file:// 协议访问）
- `sandbox: false`（预加载脚本需要访问 Node）

### 3.3 自定义协议 ficad-app://

使用 `protocol.registerFileProtocol` 注册 `ficad-app://` 协议，从 asar 包中读取文件：

```
ficad-app://local/out/renderer/index.html
  → app.asar\out\renderer\index.html
  → 读取文件并设置正确的 MIME type
```

### 3.4 IPC 通道

预加载脚本暴露以下 API 到渲染进程（`window.electronAPI`）：

| 通道 | 说明 |
|---|---|
| `electron.getAppVersion()` | 返回 Electron 应用版本 |
| `electron.getPlatform` | 返回 `win32` / `darwin` |
| `electron.openExternal(url)` | 打开外部 URL（安全） |

同时暴露 `window.env = { DEV: false, PROD: true }`（因为主进程非开发模式）。

---

## 4. 构建配置

### 4.1 构建工具

使用 **electron-vite** + **electron-builder**：
- `electron-vite build` 编译 main/preload/renderer
- `electron-builder --win --dir` 打包为 win-unpacked 目录

### 4.2 构建产物

| 产物 | 说明 |
|---|---|
| `dist/win-unpacked/Ficad Web.exe` | 便携版可执行文件 |
| `dist/win-unpacked/resources/app.asar` | 应用代码包 |

### 4.3 关键配置

**electron.vite.config.ts**:
- main: `out/main/index.js`
- preload: `out/preload/index.js`（CJS 格式）
- renderer: `out/renderer/`（链接自 ficad_web）

**package.json build**:
```json
{
  "appId": "com.ficad.web",
  "productName": "Ficad Web",
  "directories": { "output": "dist" },
  "win": { "target": ["dir"] }
}
```

---

## 5. 渲染进程

### 5.1 路由配置

使用 **HashRouter**（不是 BrowserRouter），因为：
- Electron 打包后访问 `file://` 路径，BrowserRouter 的 history 模式无法工作
- HashRouter 使用 `#` 锚点：`ficad-app://local/#/workspace`
- 所有路由保持不变：`/` → `/workspace` → `/workspace/:projectId`

### 5.2 localStorage 保护

所有 localStorage 访问都包裹在 try-catch 中，防止协议切换时访问被拒绝：

```ts
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try { return localStorage.getItem(key) } catch { return null }
  },
  setItem: (key: string, value: string): void => {
    try { localStorage.setItem(key, value) } catch { }
  },
}
```

受影响文件：
- `src/stores/ui-store.ts`（persist middleware）
- `src/i18n/index.ts`（i18next lng 配置）

### 5.3 生产模式加载

渲染进程通过 `ficad-app://` 协议加载 `out/renderer/index.html`，所有资源（JS/CSS/图片）通过同一协议加载。

---

## 6. 功能验证

应用启动后需验证以下功能正常：

- ✅ 3D 视图正常渲染（WebGL/Three.js Canvas）
- ✅ 文件上传（拖拽 + 点击）STL/3MF/STEP/GLB
- ✅ 工具栏切换（View / Transform / Modeling / Boolean / Measure）
- ✅ 撤销/重做（历史记录）
- ✅ 语言切换（中/英）- 持久化到 localStorage
- ✅ 暗色/亮色主题切换
- ✅ 响应式布局（640px 断点）
- ✅ 聊天面板（需后端服务）
- ✅ Playwright E2E 测试全部通过（4/4）

---

## 7. 已解决问题

| 问题 | 解决方案 |
|---|---|
| preload 加载失败（sandbox 阻止） | `sandbox: false` |
| preload SyntaxError（ESM in asar） | `format: 'cjs'` + `index.js`（非 .mjs） |
| React 不渲染（localStorage 拒绝） | try-catch 包装 + `webSecurity: false` |
| 路由不匹配（file:// vs /workspace） | HashRouter 替代 BrowserRouter |
| CDP Runtime.evaluate 超时 | did-finish-load 后等待 page 完全加载 |

---

## 8. 构建命令

```bash
# 开发构建
npx electron-vite build

# 打包（便携版）
npx electron-builder --win --dir

# 完整构建
npm run build:unpacked

# 运行 E2E 测试（需先 npm run dev）
npx playwright test
```