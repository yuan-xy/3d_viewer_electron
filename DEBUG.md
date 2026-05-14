# Electron 桌面应用白屏问题排查与修复

## 问题描述

将 Ficad Web（React + Vite + Tailwind）通过 Electron 35 打包为 Windows 桌面应用后，窗口显示白屏，React 应用未能渲染。通过 Chrome DevTools Protocol（CDP）诊断发现：

```
readyState: complete
title: ficad_web
root: ""        ← React 未挂载
canvas: 0       ← Three.js 未渲染
```

## 排查过程

### 第一阶段：文件加载

验证 asar 包中文件是否存在且路径正确：

```bash
npx asar list dist/win-unpacked/resources/app.asar
# 输出：\out\renderer\index.html, \out\preload\index.js, \out\main\index.js
```

HTML 和 JS 文件都存在于 asar 中。使用 HTTP 服务器直接加载 `out/renderer/` 目录验证了文件内容正确。

### 第二阶段：preload 脚本

CDP 捕获到关键错误：

```
CONSOLE[error]: "Unable to load preload script: ...\app.asar\out\preload\index.mjs"
SyntaxError: Cannot use import statement outside a module
```

**原因**：electron-vite 默认输出 ESM 格式（`.mjs`），但 Electron 的 `sandbox: true` 模式下预加载脚本必须为 CJS 格式。

**修复**：
1. 在 `electron.vite.config.ts` 的 preload 配置中添加 `format: 'cjs'`
2. 将 `preload: join(__dirname, '../preload/index.js')` 改为 `.js`（非 `.mjs`）
3. 重新 build 后确认输出为 `out/preload/index.js`

### 第三阶段：localStorage 拒绝

CDP 捕获到 React 渲染前就抛出的异常：

```
Runtime.exceptionThrown: "SecurityError: Failed to read the 'localStorage' property from 'Window': Access is denied for this document."
at createStoreImpl (index-DJgAgOnN.js:25967)
```

这是 Zustand persist middleware 尝试访问 localStorage 时被拒绝。调用栈显示问题源于 `src/stores/ui-store.ts` 的 persist 配置。

**根因**：在 `ficad-app://` 协议下，渲染进程的安全上下文不允许访问 localStorage。即使 `webSecurity: true`，自定义协议下的文档仍被视为 "insecure context"。

**修复**：为 ui-store 和 i18n 配置自定义 storage 适配器，用 try-catch 包装所有 localStorage 操作：

```typescript
// src/stores/ui-store.ts
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try { return localStorage.getItem(key) } catch { return null }
  },
  setItem: (key: string, value: string): void => {
    try { localStorage.setItem(key, value) } catch { }
  },
  removeItem: (key: string): void => {
    try { localStorage.removeItem(key) } catch { }
  },
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({ /* ... */ }),
    {
      name: 'ficad-ui',
      partialize: (s) => ({ language: s.language, theme: s.theme }),
      storage: {
        getItem: safeLocalStorage.getItem,
        setItem: safeLocalStorage.setItem,
        removeItem: safeLocalStorage.removeItem,
      },
    }
  )
)
```

### 第四阶段：路由完全不匹配

修复 localStorage 后，React 成功挂载但页面仍然白屏。CDP 输出：

```
root: "<section aria-label="Notifications" ...></section>"
canvas: 0
```

只有 Toaster 的 Notifications 组件被渲染，App 组件未渲染。Console 出现警告：

```
No routes matched location "/out/renderer/index.html"
```

**原因**：BrowserRouter 使用 HTML5 History API，期望 URL 路径如 `/workspace`。但 Electron 通过 `ficad-app://` 协议加载页面时，`window.location.pathname` 是 `/out/renderer/index.html` 而非 `/workspace`。React Router 无法匹配任何路由。

**修复**：将 `BrowserRouter` 替换为 `HashRouter`：

```tsx
// src/main.tsx
import { HashRouter } from 'react-router-dom'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter>
        {/* App content */}
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>
)
```

HashRouter 使用 `#` 锚点：`ficad-app://local/out/renderer/index.html#/workspace`，路由匹配正常。

## 问题汇总

| # | 问题现象 | 根因 | 解决方案 |
|---|---|---|---|
| 1 | preload 加载失败 | `sandbox: true` + ESM 格式冲突 | `sandbox: false` + CJS 格式 |
| 2 | preload SyntaxError | electron-vite 默认输出 `.mjs` | `format: 'cjs'` + `.js` 后缀 |
| 3 | React 不渲染（localStorage） | secure context 下 localStorage 被拒绝 | try-catch 包装 storage 操作 |
| 4 | 路由不匹配 | BrowserRouter 与 file:// 协议不兼容 | HashRouter 替代 |

## 关键配置

### electron/main/index.ts

```typescript
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  webSecurity: false,   // 允许自定义协议
  sandbox: false         // 预加载脚本需要 Node 访问
}

protocol.registerFileProtocol('ficad-app', (request, callback) => {
  const url = new URL(request.url)
  const rel = url.pathname.replace(/^\/out\/renderer\//, '')
  const asarPath = join(__dirname, '..', 'renderer', rel.replace(/\//g, '\\'))
  callback({
    path: asarPath,
    headers: { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' }
  })
})
```

### electron.vite.config.ts

```typescript
preload: {
  plugins: [externalizeDepsPlugin()],
  build: {
    outDir: 'out/preload',
    lib: {
      entry: 'electron/preload/index.ts',
      formats: ['cjs']
    },
    rollupOptions: {
      input: { index: path.resolve(__dirname, 'electron/preload/index.ts') },
      output: { format: 'cjs', entryFileNames: '[name].js' }
    }
  }
}
```

## 验证方法

### CDP 诊断脚本

```javascript
// 连接 CDP 后执行
Runtime.evaluate({
  expression: `JSON.stringify({
    readyState: document.readyState,
    title: document.title,
    root: document.getElementById('root')?.innerHTML?.slice(0, 200) || 'null',
    canvas: document.querySelectorAll('canvas').length
  })`
})
```

正常输出：`{"readyState":"complete","title":"ficad_web","root":"<div class=\"h-screen...","canvas":3}`

### 检查预加载错误

CDP 监听 `Runtime.consoleAPICalled` 事件，preload 失败会输出：
- `"Unable to load preload script: ..."` → 检查 sandbox 配置
- `"Cannot use import statement outside a module"` → 检查输出格式

### 检查 React 挂载

```javascript
Runtime.evaluate({
  expression: 'document.getElementById("root")?.children?.length || 0'
})
// 0 = 未挂载，> 0 = 已挂载
```

## 经验教训

1. **Electron 预加载脚本格式**：在 asar 打包环境下，预加载脚本必须是 CJS 格式（.js），不能是 ESM（.mjs）。electron-vite 默认输出 ESM，需要显式配置 `format: 'cjs'`。

2. **sandbox 模式与 preload 的冲突**：`sandbox: true` 会阻止预加载脚本访问 Node.js API，即使脚本本身是 CJS 格式也会导致加载失败。需要在 `webSecurity: false` 的配合下使用 `sandbox: false`。

3. **自定义协议的 localStorage**：通过 `protocol.registerFileProtocol` 注册的 `ficad-app://` 协议，其文档被视为 insecure context，localStorage 访问会被拒绝。所有持久化存储都需要 try-catch 保护。

4. **BrowserRouter 在 Electron 中的局限**：HTML5 History 模式依赖 `window.location`，但 `file://` 或自定义协议下的 `location.pathname` 不包含应用路由，导致 React Router 无法匹配。HashRouter 不依赖 `window.location.pathname`，更适合 Electron 打包场景。

5. **开发工具的重要性**：CDP（Chrome DevTools Protocol）是排查 Electron 白屏问题的关键工具。通过 CDP 可以绕过 UI 直接检查 DOM 状态、捕获 JavaScript 异常、验证 React 挂载情况。建议在主进程添加 CDP 调试代码或编写独立诊断脚本。

6. **协议转换的路径处理**：`protocol.registerFileProtocol` 中 URL 的 pathname 是 Unix 风格（`/out/renderer/index.html`），需要转换为 Windows 路径（`out\renderer\index.html`）才能正确访问 asar 内的文件。