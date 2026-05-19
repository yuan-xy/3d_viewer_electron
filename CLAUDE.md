# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Faicad 3D Viewer is an Electron desktop application for viewing 3D model files (STL/GLB/3MF/STEP/STP). It uses a custom protocol `faicad-viewer://` to serve the renderer process.

## Common Commands

```bash
npm run dev          # Start development server
npm run build        # Build all processes (main + preload + renderer)
npm run build:unpacked  # Build + package as unpacked dir (dist/win-unpacked/)
npm run build:win     # Build + package as NSIS installer (dist/)
npm run lint          # Run ESLint
npx vitest run        # Run unit tests
npx playwright test   # Run integration tests
```

**Single test file**: `npx vitest run src/renderer/lib/step-converter/stepToGlb.test.ts`

## Architecture

### Three-Process Model (electron-vite)

- **`electron/main/index.ts`** — Main process: window management, custom protocol registration (`faicad-viewer://`), filesystem IPC handlers
- **`electron/preload/index.ts`** — Preload script: exposes `electronAPI` (fs operations, external links) and `env` (DEV/PROD flag) via contextBridge
- **`src/renderer/`** — React renderer process

### Custom Protocol

The app registers `faicad-viewer://` to serve renderer assets without CORS issues. In dev mode it serves from `src/renderer/public/`; in production from the asar bundle. All renderer URLs use this protocol (e.g. `faicad-viewer://local/out/renderer/index.html`).

### 3D Engine Stack

- **Three.js + React Three Fiber + Drei** — Core 3D rendering
- **STEP file support** — `occtLoader.ts` + `GlbBuilder.ts` in `src/renderer/lib/step-converter/` handle STEP→GLB conversion via Web Workers

### IPC / Context Bridge API

Renderer accesses main process via `window.electronAPI`:
- `readDirectory(dirPath)` — list 3D files in a directory
- `readFileAsBase64(filePath)` — read file as base64
- `openExternal(url)` — open URL in system browser
- `getFilePath(file)` — get native path for a File object

### State Management

Zustand stores in `src/renderer/stores/`. No Redux or other state library.

### File Format Configuration

`src/renderer/config/file-formats.ts` exports `ALL_EXTENSIONS` — used by both main process (IPC `fs:readDirectory`) and renderer for validation.

## Tech Stack

- React 19 + TypeScript
- electron 35 + electron-vite 3
- Three.js + React Three Fiber + Drei
- Radix UI + TailwindCSS
- Zustand (state)
- Vitest (unit tests) + Playwright (integration tests)
- electron-builder (packaging)


强调：任务完成前/代码提交到git前，必须跑scripts下面的ci脚本。windows环境，要跑scripts/ci.ps1, Linux跑scripts/ci.sh。

