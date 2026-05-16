# Ficad 客户端-服务端接口协议

本文档面向 Web 客户端开发者，完整描述 Ficad 后端的所有 HTTP 接口、SSE 事件流、交互协议和调用约定。

---

## 1. 连接与认证

### 1.1 传输层

- **协议**：HTTP/1.1
- **数据格式**：JSON（请求/响应）、SSE（流式事件）
- **CORS**：允许 `localhost:*`、`127.0.0.1:*`，可通过 `--cors` 扩展

### 1.2 HTTP Session（Cookie）

Ficad 使用 **hono-sessions + CookieStore** 实现无状态会话管理：

- Cookie 名：`ficad_session`
- 内容：`<base64(encrypted_payload)>--<hmac_signature>`（自包含签名，服务器零存储）
- 有效期：7 天（自动延期）
- 属性：`HttpOnly; SameSite=Lax; Path=/`

解码后的 payload：
```json
{
  "httpSessionId": "uuid-string",
  "projectId": "p1",
  "createdAt": 1699999999
}
```

> 注意：`userId` **不存储在 Cookie session 中**，而是通过 JWT Bearer token 的 `sub` claim 独立传递。

**客户端职责**：
- 自动保存和发送 Cookie（浏览器默认行为）
- 无需手动管理，服务端在首次请求时自动设置

### 1.3 用户标识

| Header | 说明 | 必需 |
|--------|------|------|
| `Authorization` | Bearer JWT token（ficad-auth 签发，`sub` 为用户 ID） | 生产环境：是；开发环境：否（fallback 到 `DEV_USER_ID` 或 `u1`） |
| `Cookie` | `ficad_session` 包含 httpSessionId, projectId | 自动 |

---

## 2. Web 客户端 API

以下为 Web 客户端可调用的接口。其他路由（`/config`、`/agent`、`/skill`、`/command`、`/path`、`/log`、`/event`、`/global/config`、`/global/dispose`）属于 CLI 内部接口，不向 Web 客户端暴露。

### 2.1 Global

| 方法 | 路径 | 说明 | 请求体 | 响应体 |
|------|------|------|--------|--------|
| GET | `/global/health` | 健康检查 | — | `{ healthy: true, version: string }` |
| GET | `/global/event` | 全局事件流（SSE） | — | SSE 流 |

### 2.2 Projects

| 方法 | 路径 | 说明 | 请求体 | 响应体 |
|------|------|------|--------|--------|
| POST | `/projects` | 创建项目 | `{ name: string, description?: string }` | `Project.Info` |
| GET | `/projects` | 列出用户项目 | — | `Project.Info[]` |
| GET | `/projects/:projectID` | 获取项目详情 | — | `Project.Info` |
| PATCH | `/projects/:projectID` | 更新项目 | `{ name?, description? }` | `Project.Info` |
| DELETE | `/projects/:projectID` | 删除项目（仅 owner） | — | `true` |
| GET | `/projects/:projectID/members` | 列出成员 | — | `MemberInfo[]` |
| POST | `/projects/:projectID/members` | 添加成员 | `{ userId, role: "admin"\|"editor"\|"viewer" }` | `MemberInfo` |
| DELETE | `/projects/:projectID/members/:userID` | 移除成员 | — | `true` |
| GET | `/projects/:projectID/commits` | 获取提交历史（线性） | `?branch=main` | `CommitEntry[]` |
| GET | `/projects/:projectID/checkout` | checkout 到指定提交并返回 GLB | `?commitid=<id>` | GLB 二进制 |
| POST | `/projects/:projectID/file` | 上传 3D 文件 | `multipart/form-data` (file) | `UploadResult` |
| POST | `/projects/:projectID/prompt` | **发送 Prompt（SSE 流式）** | 见下方 | SSE 流 |

### 2.3 Title

| 方法 | 路径 | 说明 | 请求体 | 响应体 |
|------|------|------|--------|--------|
| POST | `/title` | 生成会话标题 | `{ message: string }` | `{ title: string }` |

### 2.4 Question

| 方法 | 路径 | 说明 | 请求体 | 响应体 |
|------|------|------|--------|--------|
| GET | `/question/:projectId/question` | 获取待回答问题 | — | `Question.Request[]` |
| POST | `/question/:requestID/reply` | 提交回答 | `{ answers: string[][] }` | `true` |
| POST | `/question/:requestID/reject` | 拒绝问题 | — | `true` |

### 2.5 Commits（提交历史）

```
GET /projects/:projectID/commits?branch=main
```

获取指定分支的线性提交历史，从新到旧排列。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectID` | path | 是 | 项目 ID |
| `branch` | query | 否 | 分支名，默认 `"main"` |

**响应 200：**

```json
[
  {
    "id": "abc123",
    "parent": "def456",
    "author": "user-1",
    "message": "Add main.py",
    "timestamp": "2026-05-01T10:30:00.000Z"
  }
]
```

- `parent` 为 `null` 表示根提交
- 空仓库或无提交的分支返回 `[]`
- 权限：viewer 及以上

### 2.6 Checkout（查看历史版本模型）

```
GET /projects/:projectID/checkout?commitid=<id>
```

将工作区 checkout 到指定 commit，执行 Python 构建管线（`main.py` → STL → GLB），返回生成的 GLB 二进制文件。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectID` | path | 是 | 项目 ID |
| `commitid` | query | 是 | 目标 commit ID |

**响应 200：** 二进制 GLB 数据，`Content-Type: model/gltf-binary`

**错误：**
- 400：缺少 `commitid` 参数
- 500：commit 不存在、`main.py` 缺失、Python 执行失败、或 STL→GLB 转换失败

**权限：** viewer 及以上（只读操作，不产生新提交）

### 2.7 File Upload（文件上传）

```
POST /projects/:projectID/file
Content-Type: multipart/form-data
```

上传 3D 模型文件到项目。上传成功后文件自动转换为 GLB 格式并纳入版本历史。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectID` | path | 是 | 项目 ID |
| `file` | form field | 是 | 上传的文件（multipart form field） |

**约束：**
- 文件大小上限：100MB
- 允许的后缀：`.stl`、`.glb`、`.gltf`、`.3mf`、`.stp`、`.step`
- 文件内容会与服务端声称后缀名做校验，不匹配返回 400
- 不安全或控制字符会从文件名中移除，超长文件名会被截断

**响应 200：**

```json
{
  "id": "abc123",
  "parent": "def456",
  "author": "u1",
  "message": "model.stl",
  "glb": "<base64>",
  "timestamp": "2026-05-01T10:30:00.000Z"
}
```

- `id`：本次上传产生的版本 ID
- `parent`：父版本 ID，首次提交时为 `null`
- `author`：用户 ID
- `message`：清理后的用户原始文件名（用于展示）
- `glb`：base64 编码的 GLB 3D 模型数据
- `timestamp`：ISO 8601 时间戳

**错误：**
- 400：未提供文件、文件为空、后缀不支持、文件内容校验失败、文件超过 100MB
- 403：viewer 角色无上传权限
- 500：文件转换失败

**权限：** editor 及以上

**调用示例：**

```typescript
const formData = new FormData()
formData.append("file", fileObject)  // File from <input type="file">

const response = await fetch(`/projects/${projectId}/file`, {
  method: "POST",
  credentials: "include",
  body: formData,
})
const result = await response.json()
// result: { id, parent, author, message, glb, timestamp }
```

---

## 3. Prompt API（核心对话接口）

### 3.1 请求

```
POST /projects/:projectID/prompt
Content-Type: application/json

{
  "parts": [
    { "type": "text", "text": "用户输入的消息" }
  ],
  "agent": "build"        // 可选: "build" | "plan"
}
```

**斜杠命令**：`/plan` 和 `/build` 作为普通文本发送，服务端纯字符串匹配拦截，不会调用 AI，直接返回切换结果。

### 3.2 响应（SSE 流）

响应为 `text/event-stream`，事件格式：

```
data: {"type":"start","timestamp":1710000000000}
data: {"type":"reasoning","text":"用户需要一个..."}
data: {"type":"text","text":"好的，我来生成..."}
data: {"type":"tool","tool":"write","phase":"complete"}
data: {"type":"finish","status":"completed"}
data: {"type":"result","status":"completed","result":{"type":"model","glb":"<base64>","text":"..."}}
```

### 3.3 SSE 事件类型

```typescript
// 开始
{ type: "start", timestamp: number }

// AI 推理过程（思维链）
{ type: "reasoning", text: string }

// AI 文本输出（逐字增量）
{ type: "text", text: string }

// 工具调用（已过滤 path 字段——不泄露服务器路径）
{ type: "tool", tool: string, phase: "start" | "complete" }

// AI 完成（不再调用工具）
{ type: "finish", status: "completed" | "error" }

// 错误
{ type: "error", message: string }

// 最终结果（最后一条事件）
{ type: "result", status: "completed" | "error", result?: { type: "model"|"text", glb?: string, text?: string }, error?: string }
```

### 3.4 事件时序

```
start → (reasoning? → text* → tool*)+ → finish → result
                                                或
start → error → result
```

- `text` 事件可能出现多次（逐字增量）——客户端应**累积拼接**
- `tool` 事件可能出现多次（每次工具调用产生两个事件：start + complete）
- `finish` 表示 AI 循环结束
- `result` 是**最后一条**事件，包含最终结果或错误

### 3.5 result 事件的三种情况

| 场景 | result |
|------|--------|
| **建模成功** | `{ type: "result", status: "completed", result: { type: "model", glb: "<base64>", text: "..." } }` |
| **普通回复** | `{ type: "result", status: "completed", result: { type: "text", text: "..." } }` |
| **出错** | `{ type: "result", status: "error", error: "..." }` |

- `glb` 是 base64 编码的 GLB 3D 模型文件
- `text` 是 AI 的最终文本回复

---

## 4. Question 问答协议

当 AI 在执行过程中需要向用户提问时，会触发 Question 协议。这是一个**异步阻塞**机制：

### 4.1 协议流程

```
服务端（AI 调用 question tool）
  → Question.ask({ projectID, httpSessionId, questions })
  → Bus.publish("question.asked", Request)
  → Promise 挂起，等待用户回答（最长 5 分钟）

客户端：
  1. 轮询 GET /question/:projectId/question → 获取待回答问题
     或通过 SSE 事件收到 question.asked 通知
  2. 展示问题给用户
  3. 用户选择后：
     POST /question/:requestID/reply  → resolve Promise
     或
     POST /question/:requestID/reject → reject Promise

服务端：
  Promise resolve → question tool 返回 → AI 继续对话循环
```

### 4.2 数据结构

```typescript
// 问题定义
Question.Info = {
  question: string            // 完整问题
  header: string              // 短标签（max 30 chars）
  options: {                  // 选项列表
    label: string             // 显示文本（1-5 words）
    description: string       // 详细说明
  }[]
  multiple?: boolean          // 允许多选
  custom?: boolean            // 允许自定义回答（默认 true）
}

// 问题请求（服务端 → 客户端）
Question.Request = {
  id: string                  // QuestionID（如 "que_001"）
  projectID: string
  httpSessionId: string
  questions: Question.Info[]
  tool?: {
    messageID: string
    callID: string
  }
}

// 用户回答（客户端 → 服务端）
Question.Reply = {
  answers: string[][]         // 每个问题一个 string[]，顺序对应 questions
}
```

### 4.3 HTTP 接口

**获取待回答问题**：
```
GET /question/:projectId/question

Response: Question.Request[]
```

> 仅返回当前 HTTP Session 的问题（多用户隔离）。

**提交回答**：
```
POST /question/:requestID/reply
Content-Type: application/json

{ "answers": [["Option 1"], ["Option 2"]] }

Response: true
```

**拒绝问题**：
```
POST /question/:requestID/reject

Response: true
```

### 4.4 关键约定

- **多用户隔离**：`Question.list()` 仅返回当前 HTTP Session 的问题，不同 session 互不可见
- **超时**：问题 5 分钟无人回答自动超时
- **上下文依赖**：reply/reject 需要 `RequestContext.httpSessionId` 匹配（由 Cookie 自动提供）
- **异步性质**：Question 是阻塞 AI 循环的 Promise，客户端 answer 后 AI 在同一 SSE 流中继续输出

---

## 5. 事件流（/global/event SSE）

Web 客户端通过 `/global/event` 接收全局 Bus 事件：

```
GET /global/event
```

SSE 流格式：

```json
{
  "type": "事件类型",
  "properties": { ... }
}
```

**Web 客户端关注的事件**：

| 事件 | 触发时机 | properties |
|------|----------|------------|
| `server.connected` | 客户端连接 | `{}` |
| `server.heartbeat` | 每 10 秒（保活） | `{}` |
| `question.asked` | 新问题待回答 | `Question.Request` |
| `question.replied` | 问题已回答 | `{ projectID, requestID, answers }` |
| `question.rejected` | 问题被拒绝 | `{ projectID, requestID }` |

> `/global/event` 会按 `httpSessionId`（来自 Cookie session）过滤，每个客户端只收到自己 session 相关的事件（如 `question.asked`）。Prompt SSE 流（`/projects/:projectID/prompt`）是请求级直连，无需过滤。

---

## 6. 典型调用流程

### 6.1 创建项目并发送第一条 Prompt

```
1. POST /projects
   Body: { "name": "我的项目" }
   → { id: "p1", name: "我的项目", ownerId: "u1", ... }
   → Cookie 中自动设置 projectId = "p1"

2. POST /projects/p1/prompt
   Body: { "parts": [{ "type": "text", "text": "一个边长5mm的立方体" }] }
   → SSE 流: start ... text ... tool ... finish ... result
   → result: { status: "completed", result: { type: "model", glb: "<base64>" } }
```

### 6.2 AI 提问交互

```
1. 用户发送 Prompt（同 6.1）
2. 通过 /global/event SSE 流收到 question.asked 事件
3. 客户端展示问题 → 用户选择
4. POST /question/que_001/reply
   Body: { "answers": [["Yes"]] }
5. AI 在原始 SSE 流中继续输出（无需重新连接）
```

### 6.3 Plan → Build 切换

```
1. 用户发送 "/plan"
   POST /projects/:id/prompt
   Body: { "parts": [{ "type": "text", "text": "/plan" }] }
   → SSE 流: start → finish → result (type: "text")
   → result.text: "Switched to plan agent."

2. 用户在 plan 模式下发送具体任务
   POST /projects/:id/prompt
   Body: { "parts": [{ "type": "text", "text": "规划如何实现登录功能" }], "agent": "plan" }
   → Plan agent 研究代码、写 plan.md、可能提问
   → 最后调用 plan_exit 提问是否切换到 build

3. 用户同意切换（回答 plan_exit 的 Yes/No）
   POST /question/:requestID/reply
   Body: { "answers": [["Yes"]] }

4. 用户在 build 模式下继续
   POST /projects/:id/prompt
   Body: { "agent": "build", ... }
```

### 6.4 连续对话

```
同一项目内的多次 Prompt 调用共享 workspace（main.py 状态）：

第一次: "边长5mm的立方体"
  → AI 写 main.py → build_model → 生成 main.glb

第二次: "改成10mm"
  → AI 读 main.py → 修改参数 → build_model → 生成 main.glb
```

---

## 7. 客户端实现要点

### 7.1 Cookie 管理

浏览器自动处理，无需手动操作。确保：
- 请求时携带 credentials（fetch: `credentials: "include"`）
- 不手动设置或修改 `ficad_session` Cookie

### 7.2 SSE 读取

```typescript
// Prompt SSE（流式对话响应）
const response = await fetch(`/projects/${projectId}/prompt`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ parts: [{ type: "text", text: message }] }),
})

const reader = response.body.getReader()
const decoder = new TextDecoder()
// 解析 SSE 格式: "data: {...}\n\n"
```

### 7.3 Question 检测

- 主要方式：监听 `/global/event` SSE 流中的 `question.asked` 事件
- 备用方式：在 Prompt SSE 流结束后轮询 GET `/question/:projectId/question`

### 7.4 错误处理

| HTTP 状态码 | 含义 |
|-------------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 404 | 项目/资源不存在 |
| 500 | 服务器内部错误 |

SSE 流中 `{ type: "error", message: "..." }` 表示非致命错误（AI 可恢复）。

`{ type: "result", status: "error", error: "..." }` 表示致命错误（对话终止）。

### 7.5 客户端状态机

```
IDLE
  → 用户提交 Prompt
  → STREAMING (SSE 连接中)
    → 收到 text/tool/reasoning 事件 → 更新 UI
    → 检测到 question.asked → POLLING_QUESTION
      → 用户回答 → reply → 回到 STREAMING
    → 收到 finish + result → IDLE
    → 收到 error → IDLE (显示错误)
```

## 斜杠命令（快捷路径）
切换代理模式:
/plan
/build

几何操作：
/resize [x/y/z]的的百分比，比如[100%, 80.5%, 150%]

/translate 增量坐标[x,y,z]，比如[1, 0, 1], 数值是什么意思？不是像素，是计量单位如mm

/rotate x/y/z角度，逆时针为正，如[x90, y-45], 显示[x90°, y-45°]，用户输入时可以带°也可以省略，显示时统一加上。这里是否存在欧拉角的问题。

/split  如何用文本表示split的平面方程，是否支持曲面split（如榫卯切割）

/cut 物体1 物体2, 物体如何用文字指代，可以是物体的名字。默认ai自动取名。但这样就是英文了。
/union  物体1 物体2
/intersection  物体1 物体2

