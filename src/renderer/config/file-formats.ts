// 29 种格式的全部配置，含每个格式的扩展名、Loader、分组、样例文件路径
// Data: verified against three.js examples/models/ and examples/jsm/loaders/

export type FileGroup =
  | 'mesh'
  | 'cad'
  | 'bim'
  | 'point'
  | 'volume'
  | 'animation'
  | 'gcode'
  | 'other'

export type FormatId =
  | 'stl'
  | 'glb'
  | 'gltf'
  | '3mf'
  | 'step'
  | 'obj'
  | 'ply'
  | 'fbx'
  | 'dae'
  | '3ds'
  | 'usdz'
  | 'drc'
  | 'bvh'
  | 'vtk'
  | 'xyz'
  | 'pdb'
  | 'nrrd'
  | 'gcode'
  | 'wrl'
  | 'vox'
  | 'kmz'
  | 'amf'
  | 'lwo'
  | 'md2'
  | 'mdd'
  | 'pcd'
  | 'ifc'
  | 'ldraw'
  | '3dm'

export interface FileFormatEntry {
  id: FormatId
  /** Display label for UI */
  label: string
  /** File extensions including dot (e.g. ['.stl']) */
  extensions: string[]
  /** Which three.js loader module to lazy-import */
  loaderModule: string
  /** Category grouping */
  group: FileGroup
  /** Sample file relative path under three.js examples/models/ */
  sampleFile: string
  /** Whether the loader expects decoded text (true) or binary ArrayBuffer (false) */
  textBased: boolean
  /** Whether the loader needs DRACOLoader WASM */
  needsDracoWasm: boolean
  /** Whether this format needs an external npm package not bundled with three.js */
  needsExternalDep: boolean
  /** Whether this format uses a render hint (e.g. volume, skeleton, toolpath) */
  renderHint: 'mesh' | 'volume' | 'skeleton' | 'toolpath' | 'pointcloud'
  /** Whether this format is disabled (not in accept list, can't be loaded) */
  disabled?: boolean
  /** Tailwind color class for file extension badge */
  color: string
}

export const FILE_FORMATS: FileFormatEntry[] = [
  // ---- 1-4: Already supported ----
  {
    id: 'stl',
    label: 'STL',
    extensions: ['.stl'],
    loaderModule: 'STLLoader.js',
    group: 'mesh',
    sampleFile: 'stl/...',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-blue-500',
  },
  {
    id: 'glb',
    label: 'GLB',
    extensions: ['.glb'],
    loaderModule: 'GLTFLoader.js',
    group: 'mesh',
    sampleFile: 'gltf/LeePerrySmith/LeePerrySmith.glb',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-green-500',
  },
  {
    id: 'gltf',
    label: 'GLTF',
    extensions: ['.gltf'],
    loaderModule: 'GLTFLoader.js',
    group: 'mesh',
    sampleFile: 'gltf/AnimatedMorphSphere/glTF/AnimatedMorphSphere.gltf',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-green-400',
  },
  {
    id: '3mf',
    label: '3MF',
    extensions: ['.3mf'],
    loaderModule: '3MFLoader.js',
    group: 'mesh',
    sampleFile: '3mf/...',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-orange-500',
  },
  {
    id: 'step',
    label: 'STEP',
    extensions: ['.step', '.stp'],
    loaderModule: '', // special: converted via occt-import-js.wasm
    group: 'cad',
    sampleFile: 'step/...',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-purple-500',
  },
  // ---- 5-29: New formats ----
  {
    id: 'obj',
    label: 'OBJ',
    extensions: ['.obj'],
    loaderModule: 'OBJLoader.js',
    group: 'mesh',
    sampleFile: 'obj/cerberus/Cerberus.obj',
    textBased: true,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-cyan-500',
  },
  {
    id: 'ply',
    label: 'PLY',
    extensions: ['.ply'],
    loaderModule: 'PLYLoader.js',
    group: 'mesh',
    sampleFile: 'ply/binary/dolphins_be.ply',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-teal-500',
  },
  {
    id: 'fbx',
    label: 'FBX',
    extensions: ['.fbx'],
    loaderModule: 'FBXLoader.js',
    group: 'mesh',
    sampleFile: 'fbx/mixamo.fbx',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-indigo-500',
  },
  {
    id: 'dae',
    label: 'Collada',
    extensions: ['.dae'],
    loaderModule: 'ColladaLoader.js',
    group: 'mesh',
    sampleFile: 'collada/elf/elf.dae',
    textBased: true,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-rose-500',
  },
  {
    id: '3ds',
    label: '3DS',
    extensions: ['.3ds'],
    loaderModule: 'TDSLoader.js',
    group: 'mesh',
    sampleFile: '3ds/portalgun/portalgun.3ds',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-amber-500',
  },
  {
    id: 'usdz',
    label: 'USDZ',
    extensions: ['.usdz'],
    loaderModule: 'USDZLoader.js',
    group: 'mesh',
    sampleFile: 'usdz/saeukkang.usdz',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-sky-500',
  },
  {
    id: 'drc',
    label: 'Draco',
    extensions: ['.drc'],
    loaderModule: 'DRACOLoader.js',
    group: 'mesh',
    sampleFile: 'draco/bunny.drc',
    textBased: false,
    needsDracoWasm: true,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-lime-500',
  },
  {
    id: 'bvh',
    label: 'BVH',
    extensions: ['.bvh'],
    loaderModule: 'BVHLoader.js',
    group: 'animation',
    sampleFile: 'bvh/pirouette.bvh',
    textBased: true,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'skeleton',
    color: 'text-pink-500',
  },
  {
    id: 'vtk',
    label: 'VTK',
    extensions: ['.vtk', '.vtp'],
    loaderModule: 'VTKLoader.js',
    group: 'volume',
    sampleFile: 'vtk/bunny.vtk',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-violet-500',
  },
  {
    id: 'xyz',
    label: 'XYZ',
    extensions: ['.xyz'],
    loaderModule: 'XYZLoader.js',
    group: 'point',
    sampleFile: 'xyz/helix_201.xyz',
    textBased: true,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'pointcloud',
    color: 'text-fuchsia-500',
  },
  {
    id: 'pdb',
    label: 'PDB',
    extensions: ['.pdb'],
    loaderModule: 'PDBLoader.js',
    group: 'point',
    sampleFile: 'pdb/Al2O3.pdb',
    textBased: true,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'pointcloud',
    color: 'text-red-500',
  },
  {
    id: 'nrrd',
    label: 'NRRD',
    extensions: ['.nrrd'],
    loaderModule: 'NRRDLoader.js',
    group: 'volume',
    sampleFile: 'nrrd/I.nrrd',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'volume',
    color: 'text-blue-400',
  },
  {
    id: 'gcode',
    label: 'GCode',
    extensions: ['.gcode'],
    loaderModule: 'GCodeLoader.js',
    group: 'gcode',
    sampleFile: 'gcode/benchy.gcode',
    textBased: true,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'toolpath',
    color: 'text-emerald-500',
  },
  {
    id: 'wrl',
    label: 'VRML',
    extensions: ['.wrl'],
    loaderModule: 'VRMLLoader.js',
    group: 'other',
    sampleFile: 'vrml/camera.wrl',
    textBased: true,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-yellow-500',
  },
  {
    id: 'vox',
    label: 'VOX',
    extensions: ['.vox'],
    loaderModule: 'VOXLoader.js',
    group: 'other',
    sampleFile: 'vox/menger.vox',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-orange-400',
  },
  {
    id: 'kmz',
    label: 'KMZ',
    extensions: ['.kmz'],
    loaderModule: 'KMZLoader.js',
    group: 'other',
    sampleFile: 'kmz/Box.kmz',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-green-600',
  },
  {
    id: 'amf',
    label: 'AMF',
    extensions: ['.amf'],
    loaderModule: 'AMFLoader.js',
    group: 'mesh',
    sampleFile: 'amf/rook.amf',
    textBased: false, // AMFLoader needs raw ArrayBuffer to detect ZIP vs XML
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-blue-300',
  },
  {
    id: 'lwo',
    label: 'LWO',
    extensions: ['.lwo'],
    loaderModule: 'LWOLoader.js',
    group: 'mesh',
    sampleFile: 'lwo/Objects/LWO3/Demo.lwo',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-stone-500',
  },
  {
    id: 'md2',
    label: 'MD2',
    extensions: ['.md2'],
    loaderModule: 'MD2Loader.js',
    group: 'animation',
    sampleFile: 'md2/ogro/ogro.md2',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-red-400',
  },
  {
    id: 'mdd',
    label: 'MDD',
    extensions: ['.mdd'],
    loaderModule: 'MDDLoader.js',
    group: 'animation',
    sampleFile: 'mdd/cube.mdd',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    disabled: true, // morph data only, no standalone mesh to render
    renderHint: 'mesh',
    color: 'text-orange-300',
  },
  {
    id: 'pcd',
    label: 'PCD',
    extensions: ['.pcd'],
    loaderModule: 'PCDLoader.js',
    group: 'point',
    sampleFile: 'pcd/ascii/simple.pcd',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'pointcloud',
    color: 'text-slate-400',
  },
  {
    id: 'ifc',
    label: 'IFC',
    extensions: ['.ifc'],
    loaderModule: 'IFCLoader.js',
    group: 'bim',
    sampleFile: 'ifc/rac_advanced_sample_project.ifc',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: true,
    disabled: true, // needs npm install web-ifc-three web-ifc
    renderHint: 'mesh',
    color: 'text-yellow-600',
  },
  {
    id: 'ldraw',
    label: 'LDraw',
    extensions: ['.mpd', '.ldr'],
    loaderModule: 'LDrawLoader.js',
    group: 'other',
    sampleFile: 'ldraw/officialLibrary/models/10174-1-ImperialAT-ST-UCS.mpd_Packed.mpd',
    textBased: true,
    needsDracoWasm: false,
    needsExternalDep: false,
    disabled: true, // needs setPartsLibraryPath for split models, complex setup
    renderHint: 'mesh',
    color: 'text-red-600',
  },
  {
    id: '3dm',
    label: '3DM',
    extensions: ['.3dm'],
    loaderModule: '3DMLoader.js',
    group: 'mesh',
    sampleFile: '3dm/Rhino_Logo.3dm',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    color: 'text-gray-400',
  },
]

// ---- derived lookup tables ----

const ENABLED_FORMATS = FILE_FORMATS.filter((f) => !f.disabled)

/** Map from extension (with dot) to FormatId (enabled formats only) */
export const EXT_TO_FORMAT: Record<string, FormatId> = {}
/** All allowed extensions (with dot) for file input accept attribute */
export const ALL_EXTENSIONS: string[] = []
/** All allowed extensions without dots for filter checks */
export const ALL_EXTENSIONS_NO_DOT: string[] = []

for (const fmt of ENABLED_FORMATS) {
  for (const ext of fmt.extensions) {
    EXT_TO_FORMAT[ext] = fmt.id
    ALL_EXTENSIONS.push(ext)
    ALL_EXTENSIONS_NO_DOT.push(ext.slice(1))
  }
}

/** Map from FormatId to FileFormatEntry */
export const FORMAT_MAP: Record<FormatId, FileFormatEntry> = {} as Record<FormatId, FileFormatEntry>
for (const fmt of FILE_FORMATS) {
  FORMAT_MAP[fmt.id] = fmt
}

/** Map from extension (with dot) to color class (all formats for display) */
export const EXT_COLORS: Record<string, string> = {}
for (const fmt of FILE_FORMATS) {
  for (const ext of fmt.extensions) {
    EXT_COLORS[ext] = fmt.color
  }
}

/** Grouped accept string for file input (e.g. for the "Mesh" group) */
export function getGroupAccept(group: FileGroup): string {
  return ENABLED_FORMATS
    .filter((f) => f.group === group)
    .flatMap((f) => f.extensions)
    .join(',')
}

/** All extensions accept string */
export const ALL_ACCEPT = ALL_EXTENSIONS.join(',')

/** Detect format from a filename. Returns FormatId or null. Only matches enabled formats. */
export function detectFormat(filename: string): FormatId | null {
  for (const fmt of ENABLED_FORMATS) {
    for (const ext of fmt.extensions) {
      if (filename.toLowerCase().endsWith(ext)) return fmt.id
    }
  }
  return null
}
