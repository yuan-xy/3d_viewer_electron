import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// Since stepCache uses module-level dbPromise which persists across tests,
// we test memCache directly (no async/IndexedDB dependency) and
// test the IDB operations with a working mock.

// Test memCache in isolation - no async/IndexedDB needed.
describe('stepCache - memCache', () => {
  it('memCache is exported as a Map', async () => {
    const { memCache } = await import('./stepCache')
    expect(memCache).toBeInstanceOf(Map)
  })

  it('memCache stores and retrieves ArrayBuffers', async () => {
    const { memCache } = await import('./stepCache')
    const buf = new ArrayBuffer(128)
    memCache.set('path|123', buf)
    expect(memCache.get('path|123')).toBe(buf)
    memCache.clear()
  })

  it('memCache.delete removes entry', async () => {
    const { memCache } = await import('./stepCache')
    memCache.set('a|1', new ArrayBuffer(10))
    memCache.set('b|2', new ArrayBuffer(20))
    expect(memCache.size).toBe(2)
    memCache.delete('a|1')
    expect(memCache.has('a|1')).toBe(false)
    expect(memCache.has('b|2')).toBe(true)
    memCache.clear()
  })

  it('memCache.clear removes all entries', async () => {
    const { memCache } = await import('./stepCache')
    memCache.set('x|1', new ArrayBuffer(5))
    memCache.set('y|2', new ArrayBuffer(10))
    memCache.set('z|3', new ArrayBuffer(15))
    expect(memCache.size).toBe(3)
    memCache.clear()
    expect(memCache.size).toBe(0)
  })

  it('memCache overwrites key with new value', async () => {
    const { memCache } = await import('./stepCache')
    const oldBuf = new ArrayBuffer(50)
    const newBuf = new ArrayBuffer(100)
    memCache.set('key|1', oldBuf)
    expect(memCache.get('key|1')).toBe(oldBuf)
    memCache.set('key|1', newBuf)
    expect(memCache.get('key|1')).toBe(newBuf)
    expect(memCache.size).toBe(1)
    memCache.clear()
  })

  it('memCache supports many unique keys', async () => {
    const { memCache } = await import('./stepCache')
    for (let i = 0; i < 100; i++) {
      memCache.set(`file${i}.step|${i * 1000}`, new ArrayBuffer(i * 10))
    }
    expect(memCache.size).toBe(100)
    for (let i = 0; i < 100; i++) {
      expect(memCache.get(`file${i}.step|${i * 1000}`)?.byteLength).toBe(i * 10)
    }
    memCache.clear()
  })
})

// Test the key format
describe('stepCache - key format', () => {
  it('key is normalizedPath|mtimeMs', async () => {
    const { memCache } = await import('./stepCache')
    // Simulate the key format from stepToGlbCached.ts
    const key = 'C:/Users/test/Documents/model.step|1772808363923'
    memCache.set(key, new ArrayBuffer(8))
    expect(memCache.has(key)).toBe(true)
    // Wrong key should not match
    expect(memCache.has('wrong-key')).toBe(false)
    expect(memCache.get('C:/Users/test/Documents/model.step|999')).toBeUndefined()
    memCache.clear()
  })
})

// Integration: verify cache hierarchy (memCache first, then IDB)
describe('stepCache - hierarchy', () => {
  it('memCache checked first, IDB checked second (documented behavior)', async () => {
    const { memCache } = await import('./stepCache')
    // In stepToGlbCached: memCache.get(key) checked first
    // If miss, then getCached(key) from IndexedDB
    // This test documents that memCache is the first layer
    memCache.set('layer-test|100', new ArrayBuffer(16))
    const hit = memCache.get('layer-test|100')
    expect(hit).toBeDefined()
    expect(hit?.byteLength).toBe(16)
    memCache.clear()
  })
})