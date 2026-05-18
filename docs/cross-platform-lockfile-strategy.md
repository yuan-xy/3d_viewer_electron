# 跨平台 package-lock.json 管理方案

## 问题

`package-lock.json` 在不同操作系统上运行 `npm install` 会产生不同结果。平台相关的 optionalDependencies（如 `@esbuild/win32-x64` vs `@esbuild/darwin-arm64`、`@rollup/rollup-linux-x64-gnu` vs `@rollup/rollup-win32-x64-msvc`）会被 npm 按当前平台选择性写入，导致：

- 开发者在不同 OS 上 `npm install` 后 lockfile 持续漂移
- 合并 PR 时 lockfile 频繁冲突
- CI 中 `npm ci` 因 lockfile 是在其他平台生成的而失败

这是 npm 的已知设计缺陷，存在多年但未修复：
- [npm/cli#1360](https://github.com/npm/cli/issues/1360) — Install produces different package-lock.json on Linux and macOS
- [npm/cli#7493](https://github.com/npm/cli/issues/7493) — NPM scopes lockfile to OS/arch
- [npm/cli#8320](https://github.com/npm/cli/issues/8320) — Platform-specific optional deps not included
- [npm/cli#8805](https://github.com/npm/cli/issues/8805) — npm ci fails with arch-related packages in v11.6.2+

## 知名 Electron 项目的处理方式

| 项目 | 包管理器 | lockfile | 备注 |
|------|---------|----------|------|
| **Electron** (electron/electron) | Yarn v1 | `yarn.lock` | [主动从 npm 切换到 Yarn](https://github.com/electron/electron/commit/57f7c8b)，提交信息："build: ensure consistent lock files across multiple machines" |
| **VS Code** (microsoft/vscode) | Yarn v1 | `yarn.lock` | 从 npm 迁移到 Yarn 以确保跨构建机的确定性构建 |
| **Electron Fiddle** (electron/fiddle) | Yarn v1 | `yarn.lock` | 标准 Yarn 工作流 |
| **Hyper** (vercel/hyper) | Yarn v1 | `yarn.lock` | 双 `package.json` 结构（根目录 + app/），均提交 yarn.lock |
| **Zettlr** (Zettlr/Zettlr) | Yarn Berry (v2+) | `yarn.lock` | 明确"仅 Yarn"策略，不提交 `package-lock.json` |
| **Signal Desktop** (signalapp/Signal-Desktop) | **pnpm** | `pnpm-lock.yaml` | 从 npm → Yarn → pnpm，三次迁移后最终选 pnpm |

**关键结论：6 个项目中 0 个使用 npm。** Electron 团队自己就是因为 `package-lock.json` 跨平台不一致，才切到 Yarn 的。

## 推荐方案

### 方案一：pnpm（推荐）

Signal Desktop 的最终选择，也是当前社区趋势。

**优点：**
- `pnpm-lock.yaml` 原生跨平台，不存在 npm 的平台漂移问题
- 安装速度快（全局 store + 硬链接）
- 严格的依赖隔离（不会出现幽灵依赖）
- 磁盘占用小

**本项目适配成本：**
- Electron 原生模块需要扁平化 `node_modules`，配置 `.npmrc` 加一行 `node-linker=hoisted`
- `electron-builder` 已支持 pnpm 检测
- CI 中 `pnpm install --frozen-lockfile` 替代 `npm ci`

### 方案二：Yarn v1

Electron 本身使用的方案，最保守、最稳妥。

**优点：**
- `yarn.lock` 跨平台一致
- Electron 生态的事实标准（5/6 项目在用）
- 零配置支持 Electron 原生模块

**缺点：**
- Yarn v1 已进入维护模式，不再有新功能
- 速度比 pnpm 慢

## 对本项目的建议：切换到 pnpm

理由：
1. lockfile 问题从根本上解决，不需要工作流规避
2. 速度更快、磁盘更省
3. 社区方向明确（Signal Desktop 的最终选择）
4. `electron-builder` 和 `electron-vite` 均支持 pnpm
5. 迁移成本低（一行 `.npmrc` 配置 + 删除旧 lockfile）

## 迁移步骤

```bash
# 1. 安装 pnpm
npm install -g pnpm

# 2. 配置 Electron 兼容性
echo 'node-linker=hoisted' >> .npmrc

# 3. 删除旧文件
rm -rf node_modules package-lock.json

# 4. 安装依赖（生成 pnpm-lock.yaml）
pnpm install

# 5. 更新 CI workflow（见下一节）

# 6. 提交
git add pnpm-lock.yaml .npmrc package.json
git commit -m "chore: switch from npm to pnpm for cross-platform lockfile stability"
```

## CI Workflow 变更

```yaml
# 之前 (npm)
- uses: actions/setup-node@v4
  with:
    node-version: '20'
- run: npm ci
- run: npm run ci

# 之后 (pnpm)
- uses: pnpm/action-setup@v4
  with:
    version: 'latest'
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'pnpm'
- run: pnpm install --frozen-lockfile
- run: pnpm run ci
```

## 备选：如果坚持用 npm

如果不想切换包管理器，最低限度需要：

1. **锁定 lockfile 版本**：`.npmrc` 中加 `lockfile-version=3`
2. **锁定 npm 版本**：`package.json` 中加 `"packageManager": "npm@11.6.0"` + `"engines": { "npm": ">=11" }`
3. **只在一个平台（Linux CI）生成 lockfile**，其他平台只用 `npm ci`
4. **冲突时重建**：`git checkout --theirs package-lock.json && npm install --package-lock-only`
5. **CI 校验**：用 `npm ci --dry-run` 验证 lockfile 一致性

但这只是治标——npm 的跨平台 lockfile 问题是设计层面的，无法根治。
