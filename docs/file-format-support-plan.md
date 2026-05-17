# 3D 文件格式支持扩展开发计划

> 数据来源：逐个核实 `C:\git\three.js\examples\models\` 目录下有 Loader 且有实际样例文件的全部格式。
> 共 **29 种**格式同时满足：① three.js 有对应 Loader 类 ② examples/models 下有可下载样例文件。

---

## 一、全部 29 种格式清单

### 1.1 已支持（4 种，测试 fixture 在 `src/test/fixtures/`）

| # | 格式 | Loader | 已有 fixture |
|---|------|--------|-------------|
| 1 | STL | STLLoader | `src/test/fixtures/` 中已有 |
| 2 | GLB | GLTFLoader | `src/test/fixtures/test-box.glb` 等 |
| 3 | 3MF | ThreeMFLoader | `src/test/fixtures/vise.3mf` 等 |
| 4 | STEP/STP | 转GLB | `src/test/fixtures/test-model.step` 等 |

### 1.2 新增支持（25 种，测试 fixture 需从 three.js 拷贝）

| # | 格式 | Loader | three.js 样例文件（绝对路径） |
|---|------|--------|------------------------------|
| 5 | OBJ | OBJLoader | `C:\git\three.js\examples\models\obj\cerberus\Cerberus.obj` |
| 6 | PLY | PLYLoader | `C:\git\three.js\examples\models\ply\binary\dolphins_be.ply` |
| 7 | GLTF（非GLB） | GLTFLoader | `C:\git\three.js\examples\models\gltf\AnimatedMorphSphere\glTF\AnimatedMorphSphere.gltf` |
| 8 | FBX | FBXLoader | `C:\git\three.js\examples\models\fbx\mixamo.fbx` |
| 9 | Collada (DAE) | ColladaLoader | `C:\git\three.js\examples\models\collada\elf\elf.dae` |
| 10 | 3DS | TDSLoader | `C:\git\three.js\examples\models\3ds\portalgun\portalgun.3ds` |
| 11 | USDZ | USDZLoader | `C:\git\three.js\examples\models\usdz\saeukkang.usdz` |
| 12 | Draco | DRACOLoader | `C:\git\three.js\examples\models\draco\bunny.drc` |
| 13 | BVH | BVHLoader | `C:\git\three.js\examples\models\bvh\pirouette.bvh` |
| 14 | VTK/VTP | VTKLoader | `C:\git\three.js\examples\models\vtk\bunny.vtk` |
| 15 | XYZ | XYZLoader | `C:\git\three.js\examples\models\xyz\helix_201.xyz` |
| 16 | PDB | PDBLoader | `C:\git\three.js\examples\models\pdb\Al2O3.pdb` |
| 17 | NRRD | NRRDLoader | `C:\git\three.js\examples\models\nrrd\I.nrrd` |
| 18 | GCode | GCodeLoader | `C:\git\three.js\examples\models\gcode\benchy.gcode` |
| 19 | VRML | VRMLLoader | `C:\git\three.js\examples\models\vrml\camera.wrl` |
| 20 | VOX | VOXLoader | `C:\git\three.js\examples\models\vox\menger.vox` |
| 21 | KMZ | KMZLoader | `C:\git\three.js\examples\models\kmz\Box.kmz` |
| 22 | AMF | AMFLoader | `C:\git\three.js\examples\models\amf\rook.amf` |
| 23 | LWO | LWOLoader | `C:\git\three.js\examples\models\lwo\Objects\LWO3\Demo.lwo` |
| 24 | MD2 | MD2Loader | `C:\git\three.js\examples\models\md2\ogro\ogro.md2` |
| 25 | MDD | MDDLoader | `C:\git\three.js\examples\models\mdd\cube.mdd` |
| 26 | PCD | PCDLoader | `C:\git\three.js\examples\models\pcd\ascii\simple.pcd` |
| 27 | IFC | IFCLoader | `C:\git\three.js\examples\models\ifc\rac_advanced_sample_project.ifc` |
| 28 | LDRAW | LDrawLoader | `C:\git\three.js\examples\models\ldraw\officialLibrary\models\10174-1-ImperialAT-ST-UCS.mpd_Packed.mpd` |
| 29 | 3DM | 3DMLoader | `C:\git\three.js\examples\models\3dm\Rhino_Logo.3dm` |

---

## 二、文件格式分组

按用途分为 8 个组：

| 分组 | 格式 |
|------|------|
| Mesh（网格模型） | STL, GLB, GLTF, 3MF, OBJ, PLY, Collada, FBX, 3DS, USDZ, Draco, LWO, AMF, 3DM |
| CAD（工业模型） | STEP/STP |
| BIM（建筑信息模型） | IFC |
| Point Cloud（点云） | XYZ, PDB, PCD |
| Volume（体数据） | NRRD, VTK/VTP |
| Animation（动画） | BVH, MD2, MDD |
| GCode（数控加工） | GCode |
| Other（其他） | VRML, VOX, KMZ, LDRAW |

---

## 三、文件格式二进制特征调研（防扩展名误判）

部分格式扩展名相同但二进制特征不同，或相同扩展名可能对应多种格式。three.js 各 Loader 内部均有自描述解析，以下是各格式实际情况：

### 2.1 纯扩展名识别、安全的格式（无歧义）

| 格式 | 扩展名 | Loader | 判断方式 | 说明 |
|------|--------|--------|---------|------|
| PLY | `.ply` | PLYLoader | header 解析 | 自动识别 ascii/binary，Loader 内部通过 `format` 行判断 |
| FBX | `.fbx` | FBXLoader | 二进制头 | 自动识别 binary/ASCII，头 21 字节为 `Kaydara FBX Binary` 则为 binary |
| 3DS | `.3ds` | TDSLoader | 二进制头 | 头 2 字节 `0x4D 0x4D`（大端） |
| Draco | `.drc` | DRACOLoader | 二进制头 | 头 4 字节 `DRACO` |
| USDZ | `.usdz` | USDZLoader | ZIP 格式 | 头 4 字节 `PK`（即 zip），内部解析 dae+纹理 |
| VRML | `.wrl` | VRMLLoader | 文本解析 | 头 4 字节 `#VRM` → VRML97 |
| BVH | `.bvh` | BVHLoader | 文本解析 | 头 4 字节 `HIER`，纯文本格式 |
| GCode | `.gcode` | GCodeLoader | 文本解析 | 头 4 字节 `;FLA`（FlashForge 等）|
| NRRD | `.nrrd` | NRRDLoader | 文本 header | 头 4 字节 `NRRD`，header 里有 encoding 字段 |
| VOX | `.vox` | VOXLoader | 二进制头 | 头 4 字节 `VOX ` |
| LWO | `.lwo` | LWOLoader | IFF 容器 | 头 4 字节 `FORM`，自动识别 LWO2/LWO3 |
| MDD | `.mdd` | MDDLoader | 二进制 | 头 4 字节 `MDDP` 或类似，整数 count 字段 |
| IFC | `.ifc` | IFCLoader | 文本 | 头 6 字节 `ISO-10303-21`，IFC 标准格式 |
| LDRAW | `.mpd` / `.ldr` | LDrawLoader | 文本 | 纯文本格式，`0 FILE` 或 `0 LDraw` 开头 |
| PDB | `.pdb` | PDBLoader | 文本 | 头 4 字节 `HEAD`，PDB 分子格式 |
| XYZ | `.xyz` | XYZLoader | 文本 | 无魔数，纯启发式（line 解析） |
| AMF | `.amf` | AMFLoader | XML 或 ZIP | 头 2 字节 `PK` → ZIP 压缩 AMF，否则 XML |
| 3DM | `.3dm` | 3DMLoader | 二进制（async） | parse 异步解码 Rhino 3DM 格式 |

### 2.2 需扩展名+内容双校验的格式

| 格式 | 扩展名 | Loader | 判断方式 | 风险 |
|------|--------|--------|---------|------|
| OBJ | `.obj` | OBJLoader | **纯扩展名** | 风险低，`.obj` 文件内容以 `v `/`f `/`o ` 开头，无其他格式用此扩展名 |
| Collada | `.dae` | ColladaLoader | **纯扩展名** | 风险低，以 `<?xml` 开头，唯一使用 `.dae` 扩展名的常见格式 |
| VTK | `.vtk` `.vtp` | VTKLoader | **纯扩展名** | VTKLegacy 头 `# vtk DataFile`，VTP 是 XML 子格式 |
| STL | `.stl` | STLLoader | **二进制头检测** | binary STL 头含 `COLOR=` 字符串；ascii STL 以 `solid` 开头 |
| KMZ | `.kmz` | KMZLoader | **ZIP 格式** | 头 4 字节 `PK`，内部 `doc.dae` |
| MD2 | `.md2` | MD2Loader | **二进制头** | 头 4 字节 `IDP2`，魔术数 844121161 |
| PCD | `.pcd` | PCDLoader | **ASCII头检测** | 头 3 字节 `# .` → ASCII PCD；否则 binary/binary_compressed |
| GLTF | `.gltf` `.glb` | GLTFLoader | **JSON vs 二进制** | `.glb` 头 4 字节 `glTF`（或有 `BIN` chunk）；`.gltf` 是 JSON |

### 2.3 需要 WASM / 外部依赖的格式

| 格式 | 依赖 | 说明 |
|------|------|------|
| STEP/STP | `occt-import-js.wasm` | 通过 stepToGlb 转为 GLB 再处理 |
| IFC | `web-ifc-three` + `web-ifc`（外部 npm 包） | IFCLoader 不在 three.js 内，来自外部 web-ifc-three 包，需额外安装 |
| Draco | `draco_decoder.wasm` | DRACOLoader 需配合 WASM decoder |
| USDZ | `draco_decoder.wasm` | USDZLoader 内部解压 draco 压缩 |

### 2.4 结论

- **绝大多数格式 three.js 会自动识别内部编码**（ascii/binary、压缩/未压缩）
- **扩展名冲突问题极少**：`.obj`/`.dae`/`.wrl` 等常用 3D 扩展名均为各自格式独占
- **无纯靠扩展名判断风险的格式**：STL 的 binary/ascii 差异由 Loader 内部处理，无需前端判断
- **AMF 特殊**：可能是 XML 也可能是 ZIP 压缩格式（后者对应 `PK` 头）

---

## 四、开发任务

### T0 - 基础设施重构（先完成，再逐格式开发）

#### T0.1：统一文件类型注册表

新建 `src/renderer/config/file-formats.ts`：

```typescript
// 29 种格式的全部配置，含每个格式的扩展名、Loader、分组、样例文件路径
export const FILE_FORMATS: FileFormatEntry[] = [ ... ]

export type FileGroup =
  | 'mesh' | 'cad' | 'point' | 'volume' | 'animation' | 'gcode' | 'other'
```

#### T0.2：文件打开对话框分组

新建 `src/renderer/components/OpenFileDialog.tsx`：
- 顶部下拉按 8 个分组快捷选择，每个分组对应 `accept` 属性
- 保留 "所有支持格式" 选项（所有扩展名拼接）

#### T0.3：文件列表分组排序

修改 `FileListPanel.tsx`：
- model-store 添加 `fileSortMode: 'name' | 'type+name'`
- 顶部切换按钮：按名称 / 按类型+名称
- `EXT_COLORS` 扩展至全部 29 种格式

---

### T1-T25：逐格式支持（每格式独立，完成后写测试）

新增 25 种格式，按以下顺序逐个添加。每格式开发步骤：
1. 从 three.js 拷贝 fixture 到 `src/test/fixtures/`
2. 在 `file-formats.ts` 注册该格式
3. `ModelGroup.tsx` 添加 format 分支，import 对应 Loader
4. 更新 `ALLOWED_EXTENSIONS`、`EXT_COLORS`
5. 写 Playwright 测试
6. 测试通过后进行下一个

| Task | 格式 | three.js 样例文件 |
|------|------|------------------|
| T1 | OBJ | `obj/cerberus/Cerberus.obj` |
| T2 | PLY | `ply/binary/dolphins_be.ply` |
| T3 | GLTF（非GLB） | `gltf/AnimatedMorphSphere/glTF/AnimatedMorphSphere.gltf` |
| T4 | FBX | `fbx/mixamo.fbx` |
| T5 | Collada | `collada/elf/elf.dae` |
| T6 | 3DS | `3ds/portalgun/portalgun.3ds` |
| T7 | USDZ | `usdz/saeukkang.usdz` |
| T8 | Draco | `draco/bunny.drc` |
| T9 | BVH | `bvh/pirouette.bvh` |
| T10 | VTK/VTP | `vtk/bunny.vtk` |
| T11 | XYZ | `xyz/helix_201.xyz` |
| T12 | PDB | `pdb/Al2O3.pdb` |
| T13 | NRRD | `nrrd/I.nrrd` |
| T14 | GCode | `gcode/benchy.gcode` |
| T15 | VRML | `vrml/camera.wrl` |
| T16 | VOX | `vox/menger.vox` |
| T17 | KMZ | `kmz/Box.kmz` |
| T18 | AMF | `amf/rook.amf` |
| T19 | LWO | `lwo/Objects/LWO3/Demo.lwo` |
| T20 | MD2 | `md2/ogro/ogro.md2` |
| T21 | MDD | `mdd/cube.mdd` |
| T22 | PCD | `pcd/ascii/simple.pcd` |
| T23 | IFC | `ifc/rac_advanced_sample_project.ifc` |
| T24 | LDRAW | `ldraw/officialLibrary/models/10174-1-ImperialAT-ST-UCS.mpd_Packed.mpd` |
| T25 | 3DM | `3dm/Rhino_Logo.3dm` |

---

## 五、测试策略

测试文件命名：`src/test/{format}-loading.spec.ts`
测试 fixture 目录：`src/test/fixtures/`

**流程**：每格式开发时，先从 three.js 拷贝样例文件到 `src/test/fixtures/`，再写测试。

```bash
# 拷贝样例文件示例
cp /c/git/three.js/examples/models/obj/cerberus/Cerberus.obj \
   /c/my/Ficad/ficad_web_electron/src/test/fixtures/Cerberus.obj
```

每个测试文件内容：
1. 用 `readFileSync` 读取 `fixtures/` 下的样例文件
2. 通过 `input[type="file"]` 加载
3. 验证无 JS 异常、scene 有内容、mesh 数量 > 0

---

## 六、验收标准

- [ ] 共支持 29 种格式（4 种已支持 + 25 种新增），覆盖全部有 Loader + 有样例文件的格式
- [ ] 打开对话框按 8 个分组选择，保留"全部"选项
- [ ] 文件列表可切换"按名称" / "按类型+名称"排序
- [ ] 每个格式有对应测试文件，测试通过
- [ ] `EXT_COLORS` 支持全部 29 种格式