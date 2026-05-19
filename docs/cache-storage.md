/**
 * IndexedDB Cache Documentation
 * =================================
 *
 * Database Name: `step-glb-cache`
 * Version: 1
 *
 * ## Stored Data
 *
 * | Store | Key | Value | Purpose |
 * |-------|-----|-------|---------|
 * | `buffers` | `{normalizedPath}|{mtimeMs}` (e.g. `C:/models/box.step|1234567890`) | ArrayBuffer (GLB file) | STEP→GLB conversion cache, keyed by file path + modification time |
 *
 * ## Cache Structure
 *
 * - Key format: `normalizedPath|mtimeMs`
 *   - `normalizedPath`: Backslash replaced with forward slash, trailing time truncated to integer
 *   - `mtimeMs`: File modification time in milliseconds (truncated)
 * - Value: Complete GLB file as `ArrayBuffer`
 *
 * ## Two-Layer Cache
 *
 * 1. **In-memory cache** (`memCache` Map): Session-scoped, cleared on page reload
 *    - Exported from `stepToGlbCached.ts`
 *    - Key same as IndexedDB key
 *
 * 2. **IndexedDB cache** (`buffers` store): Persistent across restarts
 *    - Survives page reload and browser restart
 *    - Checked on every STEP file open (cache hit = skip conversion)
 *
 * ## What is NOT stored
 *
 * - User preferences (stored in Zustand/persist via `localStorage`)
 * - Model files themselves (only converted GLB results)
 * - Any other app data
 *
 * ## Clearing the Cache
 *
 * ```ts
 * import { clearStepCache } from '@/lib/step-converter/stepCache'
 * await clearStepCache()
 * ```
 *
 * This clears both:
 * - IndexedDB `buffers` store
 * - In-memory `memCache` Map
 */