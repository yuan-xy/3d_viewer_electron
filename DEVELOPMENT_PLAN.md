# Ficad Web Electron V2 开发计划

## 目标概述

将项目从"Ficad Web 的简单 Electron 封装"改造为独立的本地 3D 文件查看器桌面应用。


核心变化：
- 脱离 `../ficad_web` 依赖，所有源码自持
- 删除后端/服务器相关功能，变成纯本地应用
- 右侧面板从聊天组件改为文件缩略图列表
- 删除建模工具栏和撤销/重做功能
- 新增文件夹内模型文件切换能力

---

## 阶段 1：源码迁移与环境搭建（1-2 天）

### 目标
将 ficad_web 中所需的源码复制到本项目 `src/` 目录下，项目可独立构建运行，不依赖 `../ficad_web`。

### 任务

1. **复制渲染进程源码**
   - 将 `../ficad_web/src/` 下所有文件和目录复制到 `./src/renderer/`
   - 复制 `../ficad_web/index.html` 到 `./src/renderer/index.html`
   - 复制 `../ficad_web/vendor/`（若有 `@ficad/sdk`）到本项目

2. **合并依赖到 package.json**
   - 将 ficad_web 的 `dependencies` 合并到本项目的 `package.json`
   - 将 ficad_web 的 `devDependencies` 合并（`@tailwindcss/vite`、`@vitejs/plugin-react` 等）
   - 删除本项目不再需要的 `ws` 依赖
   - 运行 `npm install`

3. **更新构建配置**
   - 修改 `electron.vite.config.ts`：renderer 的 `root` 指向本项目的 `src/renderer/`，不再引用 `../ficad_web`
   - 修改 `tsconfig.json` / `tsconfig.web.json` 适配新目录结构
   - 验证 `npm run build` 和 `npm run dev` 可以正常运行

4. **修改 main.tsx 的 Router**
   - 将 `BrowserRouter` 替换为 `HashRouter`（已在 DEBUG.md 中有方案）
   - 添加 localStorage 安全包装（已在 DEBUG.md 中有方案）

### 测试
- `npm run build` 成功，无类型错误
- `npm run dev` 启动后 Electron 窗口能正常显示 3D 画布
- Playwright E2E 测试（`src/test/app.spec.ts`）全部通过

### 关键文件
| 操作 | 文件 |
|------|------|
| 新建 | `src/renderer/` (从 `../ficad_web/src/` 复制) |
| 新建 | `src/renderer/index.html` |
| 修改 | `package.json` |
| 修改 | `electron.vite.config.ts` |
| 修改 | `tsconfig.json`、`tsconfig.web.json` |
| 修改 | `src/renderer/main.tsx` (BrowserRouter → HashRouter + safeLocalStorage) |

---

## 阶段 2：删除不需要的功能（1-2 天）

### 目标
删除 todo.txt 中列出的不需要的功能，保留纯粹的查看器能力。

### 任务

1. **删除工具栏切换**
   - 删除 `DesktopLayout.tsx` 中的 `toolGroups` 定义和 `<ToggleGroup>` 渲染
   - 删减 `tool-store.ts` 为最小版本（仅保留 `activeToolId: null`，始终为 view 模式）
   - 删除相关的 lucide-react 图标导入（`MousePointer2`, `Move`, `Maximize`, `RotateCw`, `Scissors`, `CircleDot`, `ArrowUp`, `Combine`, `Minus`, `Grid3x3`, `Ruler`）
   - 删除 `locales/*.json` 中所有 `toolbar.*` 翻译 key

2. **删除聊天面板**
   - 删除 `DesktopLayout.tsx` 中的 `<ChatPanel>` 组件及其函数定义
   - 删除 `src/renderer/stores/chat-store.ts`
   - 删除 `src/renderer/hooks/useSSE.ts`
   - 删除 `locales/*.json` 中所有 `chat.*` 翻译 key

3. **删除撤销/重做**
   - 删除 `DesktopLayout.tsx` 中的 Undo/Redo 按钮和 `handleUndo`/`handleRedo` 回调
   - 删除 `src/renderer/stores/history-store.ts`
   - 删除 `model-store.ts` 中对 `useHistoryStore` 的引用（`setModelBuffer` 中的 `skipHistory` 参数逻辑、`restoreBuffer` 方法）
   - 删除 `locales/*.json` 中的 `undo`/`redo` key

4. **删除后端/服务器依赖**
   - 删除 `useFileUpload.ts` 中创建项目和服务器上传的逻辑（保留本地文件读取的 `processFileLocally` 分支）
   - 删除 `src/renderer/lib/api-client.ts`
   - 删除 `src/renderer/lib/ficad-client.ts`
   - 删除 `src/renderer/lib/local-db.ts`（IndexedDB 存储不再需要）
   - 删除 `src/renderer/stores/project-store.ts`
   - 删除 `package.json` 中的 `ws` 依赖
   - 清理 `useFileUpload.ts` 中不再需要的 `projectId` 相关逻辑

5. **清理翻译文件**
   - 清理 `locales/*.json`，删除 `toolbar.*`、`chat.*`、`undo`、`redo` 相关的 key
   - 删除 `upload.failed`、`upload.noProject` 等服务器相关的 key

6. **删除 MobileLayout**（可选，目前不改。）
   - 删除 `src/renderer/layouts/MobileLayout.tsx`
   - 修改 `App.tsx` 直接使用 `DesktopLayout`，删除媒体查询分支

### 测试
- `npm run build` 成功，无类型错误
- `npm run dev` 启动后：
  - 顶部栏只显示应用名 + 下载按钮 + 面板切换按钮（无工具栏图标、无撤销/重做按钮）
  - 右侧面板为空（下一阶段实现文件列表）
  - 拖拽/点击上传 STL/GLB/3MF 文件可正常显示 3D 模型
- Playwright 测试更新：验证无工具栏组且无报错
- 手动验证：`git grep` 确认无残留的 `chat-store`、`history-store`、`project-store` 引用

### 关键文件
| 操作 | 文件 |
|------|------|
| 修改 | `src/renderer/layouts/DesktopLayout.tsx` |
| 修改 | `src/renderer/stores/tool-store.ts` |
| 修改 | `src/renderer/stores/model-store.ts` |
| 修改 | `src/renderer/hooks/useFileUpload.ts` |
| 修改 | `src/renderer/App.tsx` |
| 修改 | `src/renderer/locales/zh.json`、`en.json` |
| 删除 | `src/renderer/stores/chat-store.ts` |
| 删除 | `src/renderer/stores/history-store.ts` |
| 删除 | `src/renderer/stores/project-store.ts` |
| 删除 | `src/renderer/hooks/useSSE.ts` |
| 删除 | `src/renderer/lib/api-client.ts` |
| 删除 | `src/renderer/lib/ficad-client.ts` |
| 删除 | `src/renderer/lib/local-db.ts` |
| 删除 | `src/renderer/layouts/MobileLayout.tsx` |
| 修改 | `package.json` |

---

## 阶段 3：文件缩略图列表组件（3-4 天）

### 目标
实现右侧面板的文件缩略图列表，当加载本地文件后自动扫描所在文件夹，显示所有支持的 3D 模型文件，支持鼠标/键盘切换。

### 任务

1. **Electron 主进程新增 IPC 通道**
   - 在 `electron/main/index.ts` 中添加 `fs:readDirectory` handler：读取指定目录，过滤支持的扩展名（.stl/.glb/.3mf/.step/.stp），返回 `{name, path}[]`
   - 在 `electron/main/index.ts` 中添加 `fs:readFile` handler：读取文件并返回 base64 编码内容
   - 在 `electron/preload/index.ts` 中通过 `contextBridge` 暴露 `readDirectory` 和 `readFileAsBase64` API
   - 添加 TypeScript 类型声明（`src/renderer/types/electron.d.ts`）

2. **model-store 扩展**
   - 新增字段：
     ```typescript
     currentFolderPath: string | null
     folderFiles: { name: string; path: string }[]
     selectedFileIndex: number
     ```
   - 新增 actions：`setFolderFiles`、`setSelectedFileIndex`、`loadFolderFiles`

3. **FileListPanel 组件**
   - 在 `src/renderer/components/` 下新建 `FileListPanel.tsx`
   - 功能：
     - 显示当前文件夹路径
     - 列表渲染 `folderFiles`，每个文件项显示文件名 + 扩展名图标
     - 当前加载的文件高亮显示（不同背景色 + 边框）
     - 当前键盘选中项显示焦点样式
     - 鼠标 hover 样式
     - 空状态提示（未加载文件时）
   - 交互：
     - 鼠标点击文件项 → 加载该文件
     - 键盘 ↑↓ 移动选中索引（循环）
     - 键盘 Enter 加载选中文件
   - 键盘事件绑定在 WorkspacePage 或 DesktopLayout 层级

4. **替换右侧面板**
   - 在 `DesktopLayout.tsx` 中，将 `{ui.rightPanelOpen && (<ChatPanel />)}` 替换为 `{ui.rightPanelOpen && <FileListPanel />}`

5. **文件加载时自动扫描文件夹**
   - 修改 `useFileUpload.ts` 的 `processFileLocally`：
     - 文件加载成功后，若在 Electron 环境下（`window.electronAPI` 存在），提取文件所在文件夹路径
     - 调用 `window.electronAPI.readDirectory(folderPath)` 获取文件列表
     - 更新 `model-store` 的 `currentFolderPath`、`folderFiles`、`selectedFileIndex`

6. **键盘事件处理**
   - 在 `DesktopLayout.tsx` 或新增的 hook `useFileListKeyboard` 中：
     - 监听 ArrowUp/ArrowDown/Enter 键
     - 仅当右侧面板打开且 `folderFiles.length > 0` 时响应
     - ArrowUp: `selectedFileIndex` 减 1（循环到末尾）
     - ArrowDown: `selectedFileIndex` 加 1（循环到开头）
     - Enter: 读取选中文件的 buffer，调用 `setModelBuffer`

7. **补充翻译**
   - 在 `locales/*.json` 中新增 key：
     - `fileList.title` / "文件列表" / "Files"
     - `fileList.empty` / "加载文件后显示同目录模型" / "Load a file to browse models in the same folder"
     - `fileList.folder` / "文件夹" / "Folder"

### 测试

#### 单元测试（vitest）
- `model-store.test.ts`：测试 `folderFiles`、`selectedFileIndex` 的状态更新
- `useFileUpload.test.ts`：测试本地文件加载流程（mock Electron API）

#### E2E 测试（Playwright）
- `file-list.spec.ts`：
  1. 加载一个 GLB 文件，验证右侧面板显示同目录下的文件列表
  2. 当前文件在列表中高亮显示
  3. 鼠标点击列表中另一个文件，验证 3D 视图切换
  4. 键盘 ArrowDown 移动选中项，Enter 加载，验证切换
  5. 无文件加载时，文件列表显示空状态提示
  6. 右侧面板关闭/打开切换正常

#### 手动验证
1. 启动 Electron 应用
2. 拖拽 `D:\models\box.stl` 到窗口
3. 确认 3D 模型正常渲染
4. 确认右侧面板显示 `D:\models` 下所有 .stl/.glb/.3mf/.step/.stp 文件
5. `box.stl` 高亮显示
6. 按 ↓ 键，选中下一项，按 Enter，确认 3D 视图切换到对应文件
7. 鼠标点击其他文件，确认视图切换

### 关键文件
| 操作 | 文件 |
|------|------|
| 修改 | `electron/main/index.ts` |
| 修改 | `electron/preload/index.ts` |
| 新建 | `src/renderer/types/electron.d.ts` |
| 修改 | `src/renderer/stores/model-store.ts` |
| 新建 | `src/renderer/components/FileListPanel.tsx` |
| 修改 | `src/renderer/layouts/DesktopLayout.tsx` |
| 修改 | `src/renderer/hooks/useFileUpload.ts` |
| 修改 | `src/renderer/locales/zh.json`、`en.json` |
| 新建 | `src/test/file-list.spec.ts` |

---

## 阶段 4：UI 打磨与集成测试（1-2 天）

### 目标
UI 细节完善、错误处理、边界情况处理、完整回归测试。

### 任务

1. **文件列表 UI 打磨**
   - 文件扩展名图标或颜色标识（.stl 蓝色、.glb 绿色、.3mf 橙色、.step 紫色）
   - 当前加载文件左侧显示小圆点指示器
   - 滚动条样式适配暗色/亮色主题
   - 长文件名截断 + tooltip 显示完整路径
   - 键盘选中项自动滚动到可见区域

2. **错误处理**
   - 文件夹读取失败时的用户提示（toast）
   - 文件读取失败时的用户提示
   - 不支持格式文件的静默过滤（不在列表中显示）
   - 空文件夹时的友好提示

3. **性能优化**
   - 大量文件（100+）时的列表虚拟化（可选，取决于实际场景）
   - 文件缩略图懒加载（可选）
   - 避免重复扫描同一文件夹

4. **回归测试**
   - 运行全部 Playwright E2E 测试套件
   - 手动验证首次启动流程（无文件 → 加载文件 → 切换文件 → 关闭）
   - 验证暗色/亮色主题切换
   - 验证中英文语言切换
   - 验证窗口缩放时布局自适应

### 测试
- 全部 E2E 测试通过
- 手动验证清单全部打勾

---

## 阶段 5：打包与发布验证（0.5-1 天）

### 目标
确认生产构建可用，打包产物可正常运行。

### 任务

1. **生产构建验证**
   - `npm run build` 成功
   - `npm run build:unpacked` 成功生成 `dist/win-unpacked/Ficad Web.exe`
   - 运行 exe 验证：
     - 窗口正常显示
     - 3D 画布正常渲染（WebGL）
     - 文件拖拽上传正常
     - 文件列表正常显示
     - 键盘/鼠标切换文件正常

2. **清理收尾**
   - 更新 `README.md`
   - 删除不再需要的文档文件（`DEBUG.md`、`ELECTRON_WHITE_SCREEN_DEBUG.md`、`FILE_LIST_FEATURE.md`、`SPEC.md`——合并到 README 或本计划文档）

### 关键文件
| 操作 | 文件 |
|------|------|
| 修改 | `README.md` |
| 删除 | `DEBUG.md`、`ELECTRON_WHITE_SCREEN_DEBUG.md`、`FILE_LIST_FEATURE.md`、`SPEC.md` |

---

## 风险与依赖

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Three.js / R3F 在文件切换时 WebGL 上下文丢失 | 高 | 每个文件加载前重置 WebGL 状态，必要时释放旧资源 |
| 大文件夹扫描性能问题 | 中 | 仅过滤支持的扩展名，不做文件内容预读；若仍有问题可加防抖 |
| `ficad-app://` 协议下 localStorage 问题 | 中 | 阶段 1 就应用 safeLocalStorage 方案 |
| `@ficad/sdk` 本地包兼容性 | 中 | 阶段 1 复制 vendor 目录，验证路径和导入 |

---

## 完成标准

- [x] 项目源码完全自持，不依赖 `../ficad_web`
- [x] 无服务器/后端代码残留
- [x] 工具栏已删除（仅保留应用名和下载按钮）
- [x] 聊天面板已替换为文件列表
- [x] 撤销/重做功能已删除
- [x] 加载文件后自动扫描同目录模型文件
- [x] 键盘 ↑↓ 可切换选中文件，Enter 加载
- [x] 鼠标点击可切换文件
- [x] 拖拽上传和点击上传功能不受影响
- [x] 中英文语言切换正常
- [x] 暗色/亮色主题切换正常
- [x] 构建和打包成功
- [ ] 全部测试通过
