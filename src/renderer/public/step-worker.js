// Classic Web Worker for STEP→mesh conversion via OCCT WASM.
// Uses fetch()+eval() to load the OCCT script because importScripts()
// doesn't route through Electron's protocol.handle for custom schemes.

let occt = null;
let initPromise = null;

async function loadOcctScript() {
  const resp = await fetch('wasm/occt-import-js.cjs');
  const code = await resp.text();
  (0, eval)(code);
}

function init() {
  if (occt) return Promise.resolve(occt);
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await loadOcctScript();

    const wasmResponse = await fetch('wasm/occt-import-js.wasm');
    const wasmBinary = await wasmResponse.arrayBuffer();

    occt = await self.occtimportjs({ wasmBinary });
    console.log('[step-worker] OCCT WASM initialized');
    return occt;
  })();

  return initPromise;
}

function collectTransferables(result) {
  const list = [];
  for (const mesh of (result.meshes || [])) {
    if (mesh.attributes?.position?.array?.buffer) {
      list.push(mesh.attributes.position.array.buffer);
    }
    if (mesh.attributes?.normal?.array?.buffer) {
      list.push(mesh.attributes.normal.array.buffer);
    }
    if (mesh.index?.array?.buffer) {
      list.push(mesh.index.array.buffer);
    }
  }
  return list;
}

self.onmessage = async (e) => {
  const { type, id, stepData, params } = e.data;

  if (type === 'init') {
    init().catch(err => console.error('[step-worker] init failed:', err));
    return;
  }

  if (type === 'convert') {
    try {
      const m = await init();
      const t0 = performance.now();
      const result = m.ReadStepFile(new Uint8Array(stepData), params || {});
      const ms = (performance.now() - t0).toFixed(0);
      console.log('[step-worker] ReadStepFile done in ' + ms + 'ms, meshes=' + (result.meshes?.length || 0));

      if (!result.success) {
        self.postMessage({ type: 'result', id, success: false, error: 'STEP import failed' });
        return;
      }

      const transferList = collectTransferables(result);
      self.postMessage(
        { type: 'result', id, success: true, root: result.root, meshes: result.meshes },
        transferList,
      );
    } catch (err) {
      self.postMessage({ type: 'result', id, success: false, error: err.message || String(err) });
    }
  }
};
