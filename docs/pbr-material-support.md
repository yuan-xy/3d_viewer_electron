# PBR 材质支持方案

## 1. 问题描述

当前 `ModelGroup.tsx` 在加载 GLB 等多 Mesh 格式时，调用 `cloneMeshGeometry(src)` **只克隆几何体**，然后创建 `new THREE.Mesh(geo)` **无材质 Mesh**。JSX 渲染时使用硬编码的 `<meshStandardMaterial color="#cccccc" roughness={0.4} metalness={0.1} />` 替代。

最终效果：**所有 GLB 模型在 canvas 中渲染为同一灰色，原始材质/纹理/颜色全部丢失**。

对比缩略图管道（`thumbnailGenerator.ts`）使用 `group.add(obj.clone())` 保留了完整材质树，颜色正确。

此外，部分几何体属性被粗暴丢弃：
- `cloneMeshGeometry.ts` 清空了 `morphAttributes`（应保留数据并正确初始化 `morphTargetInfluences`）
- `ModelGroup.tsx` 删除了蒙皮属性 `skinIndex`/`skinWeight`/`joints_0`/`weights_0`（`MeshStandardMaterial` 在设置 `skinning: true` 后完全支持蒙皮）

---

## 2. 当前架构分析

### 2.1 数据流

```
formatLoaders.ts                     ModelGroup.tsx
─────────────────                    ────────────────
GLTFLoader.loadAsync(buffer)         const src = meshes[i]
  ↓                                  const geo = cloneMeshGeometry(src)
result.meshes: THREE.Mesh[]          → 仅克隆 geometry，丢弃 material
  (每个 src.mesh 携带完整材质)         processed.push(new THREE.Mesh(geo))
                                       → 纯几何体 Mesh
                                       ↓
                                    JSX: <meshStandardMaterial color="#cccccc" />
                                       → 固定灰色，忽略 src.material
```

### 2.2 材质信息实际存在于哪个环节

- `formatLoaders.ts:219-221` — `GLTFLoader.parseAsync()` 返回 `gltf.scene`，其 `Mesh` 对象携带完整 `material`（`MeshStandardMaterial` / `MeshPhysicalMaterial` + textures）
- `extractMeshes()` 遍历场景提取 Mesh 数组，每个 Mesh 的 `.material` 字段完好
- **问题发生在 ModelGroup.tsx 第 173 行和 193 行**：材质被丢弃

### 2.3 当前材质处理限制

| 方面 | 限制 |
|------|---------|
| 多材质 Mesh | `src.material` 可能是 `Material[]`（多材质组），当前完全忽略 |
| 纹理 | `src.material.map` / `normalMap` / `roughnessMap` / `metalnessMap` 等纹理没有被保留 |
| 材质类型 | 即使是标准的 `MeshStandardMaterial` 也会被丢弃 |
| 透明度 | 硬编码材质 100% 不透明 |
| 顶点颜色 | 被忽略 |
| 蒙皮属性 | `skinIndex`/`skinWeight` 等被直接删除，而非设置 `skinning: true` |
| Morph Targets | `morphAttributes` 被清空，而非初始化 `morphTargetInfluences` |

---

## 3. 设计目标

1. **有 PBR 材质的模型** — 完整保留 `MeshStandardMaterial` / `MeshPhysicalMaterial` 及其纹理（BaseColor、Normal、Roughness、Metalness、AO、Emissive、Alpha 等）
2. **无材质的模型** — 分配一个合理的默认 PBR 材质（视觉中性且符合 CAD 场景审美）
3. **非 PBR 材质** — 转换为 `MeshStandardMaterial`，尽可能保真映射属性
4. **显示模式兼容** — `wireframe` / `mesh` / `debug` / `solidWithWireframe` 模式在替代材质的同时不影响原始材质数据
5. **拓扑选择不影响** — 已有的 face/edge/vertex picking 机制继续工作
6. **生命周期完整** — 材质/纹理的 dispose 和内存管理正确
7. **几何体属性保留** — 不粗暴删除 morphAttributes / skinning 属性，而是正确初始化

---

## 4. 推荐方案：数据驱动材质 + R3F `material` prop

### 4.1 总体思路

在 `ModelGroup` 的 `useEffect` 加载阶段，保留每个源 Mesh 的材质信息（克隆后存入与 processed meshes 平行的数组中）。JSX 渲染时通过 R3F 的 `material` prop 传递给 `<mesh>`。

```
加载阶段 (useEffect):
  src = meshes[i]
  src.material ──→ clone/convert ──→ materials[i] (THREE.Material)
  src.geometry ──→ cloneMeshGeometry ──→ geo ──→ processed[i] (THREE.Mesh)

渲染阶段 (JSX):
  <mesh geometry={geo} position={pos} material={materials[i]}>
    {/* 不嵌套 <meshStandardMaterial>，除非 material 为 null 需要 fallback */}
  </mesh>
```

### 4.2 关键变更点

#### A. `ModelGroup.tsx` 加载阶段 — 新增 material 数组状态

```typescript
// 新增状态
const [meshMaterials, setMeshMaterials] = useState<(THREE.Material | THREE.Material[] | null)[]>([])
```

在处理多 Mesh 循环中：

```typescript
const processed: THREE.Mesh[] = []
const materials: (THREE.Material | THREE.Material[] | null)[] = []  // 新增

for (let i = 0; i < meshes.length; i++) {
  const src = meshes[i]
  const geo = cloneMeshGeometry(src)
  // ... 居中/蒙皮处理 ...

  // 克隆并转换材质
  const mat = cloneAndConvertMaterial(src.material)
  // 如果源 Mesh 有蒙皮属性，设置 skinning: true
  if (hasSkinningData(src) && mat) {
    setSkinningFlag(mat, true)
  }
  materials.push(mat)

  const mesh = new THREE.Mesh(geo)
  // 初始化 morphTargetInfluences 防止 WebGLMorphtargets 崩溃
  initMorphTargets(mesh)
  processed.push(mesh)
  // ...
}

setMeshMaterials(materials)
setGlbMeshes(processed)
```

#### B. `ModelGroup.tsx` 渲染阶段 — Solid 模式使用原始材质

```typescript
// Solid 模式 — 使用原始材质（无 override）
{glbMeshes.map((mesh, i) => {
  const partId = glbPartInfos[i]?.partId || `part-${i}`
  const vis = visibilityMap.get(partId) ?? true
  const mat = meshMaterials[i] ?? undefined
  return (
    <mesh
      key={i}
      visible={vis}
      geometry={mesh.geometry}
      position={mesh.position}
      material={mat}
      userData={{ ... }}
    />
  )
})}
```

> 当 `meshMaterials[i]` 为 `null` 时，R3F 的 `material={undefined}` 会导致 mesh 不可见。需要在 null 情况下 fallback 到默认 `<meshStandardMaterial>`。

### 4.3 显示模式总览

| 显示模式 | Solid 表面 | 叠加层 | 说明 |
|----------|-----------|--------|------|
| `solid` | 原始 PBR 材质 | 无 | 完整 PBR 渲染 |
| `solidWithWireframe` | 原始 PBR 材质 | DebugTopologyOverlay 特征线 | 实体面 + 拓扑线叠加（仅 STEP 等有拓扑的格式） |
| `wireframe` | 不可见（仅保留 depth） | DebugTopologyOverlay 特征线 | 仅拓扑线条（仅 STEP 等有拓扑的格式） |
| `mesh` | 三角网格线（`wireframe={true}`） | 无 | 所有格式可用，显示三角形边 |
| `debug` | 三角网格线（`wireframe={true}`） | DebugTopologyOverlay 顶点+边 | 同 mesh + 拓扑调试信息 |

> **术语区分**：`wireframe` 模式 = 拓扑特征线（`DebugTopologyOverlay` 绘制），`mesh` 模式 = 三角网格边（`MeshStandardMaterial.wireframe=true` 绘制）。`wireframe={true}` 是 Three.js 材质属性，渲染所有三角形边，对应 `mesh` 显示模式，而非 `wireframe` 显示模式。

### 4.4 Wireframe / Mesh 模式详细逻辑

**wireframe 模式**：隐藏实体面（`colorWrite={false}`），保留 `depthWrite` 以确保拓扑线的深度测试正确。

```tsx
{displayMode === 'wireframe' && (
  glbMeshes.map((mesh, i) => (
    <mesh key={i} geometry={mesh.geometry} position={mesh.position}
          material={meshMaterials[i] ?? undefined}>
      <meshBasicMaterial color="#cccccc" transparent opacity={0}
        depthWrite={true} colorWrite={false} />
    </mesh>
  ))
)}
```

> R3F 行为：当 `<mesh>` 同时有 `material` prop 和子节点材质时，**子节点材质生效**。原始材质通过 `material` prop 传入但不参与最终渲染。

**mesh 模式**：使用 `EdgesGeometry` + `LineSegments` 绘制三角形边，线条颜色继承原始材质主色。

```tsx
{displayMode === 'mesh' && (
  glbMeshes.map((mesh, i) => {
    const matColor = getMaterialColor(meshMaterials[i]) ?? '#cccccc'
    return (
      <lineSegments key={i} position={mesh.position}
        visible={visibilityMap.get(glbPartInfos[i]?.partId || `part-${i}`) ?? true}>
        <edgesGeometry args={[mesh.geometry, 1]} />
        <lineBasicMaterial color={matColor} />
      </lineSegments>
    )
  })
)}
```

> `getMaterialColor()` 从材质中提取主色。如果材质有纹理贴图，取 fallback `#cccccc`。
> `EdgesGeometry` 需在加载阶段预计算并 memoize，避免每次渲染重新创建。

**debug 模式**：同 `mesh` 模式（显示三角网格线），额外依赖 `DebugTopologyOverlay` 显示顶点/边调试信息。

---

## 5. 材质克隆与转换策略

### 5.1 `cloneAndConvertMaterial(src: Material | Material[]): Material | Material[] | null`

这是最核心的工具函数。设计为一个独立模块 `src/renderer/engine/components/cloneMaterial.ts`。

```
输入: THREE.Material | THREE.Material[]
输出: THREE.Material | THREE.Material[] | null
```

### 5.2 材质类型映射表

| 源材质类型 | 目标类型 | 策略 |
|---------------|----------|---------|
| `MeshPhysicalMaterial` | `MeshPhysicalMaterial` | `clone()` 保留全部，包括 clearcoat/sheen/transmission |
| `MeshStandardMaterial` | `MeshStandardMaterial` | `clone()` 保留全部 |
| `MeshPhongMaterial` | `MeshStandardMaterial` | 属性映射（见 §5.3） |
| `MeshLambertMaterial` | `MeshStandardMaterial` | 属性映射（见 §5.4） |
| `MeshToonMaterial` | `MeshStandardMaterial` | 属性映射（见 §5.7） |
| `MeshNormalMaterial` | `MeshNormalMaterial` | `clone()` 直接保留（调试可视化材质） |
| `MeshBasicMaterial` | `MeshStandardMaterial` | 属性映射（见 §5.5） |
| `MeshMatcapMaterial` | `MeshStandardMaterial` | 提取颜色和纹理，roughness=1.0, metalness=0（无光照） |
| `MeshDistanceMaterial` | `MeshStandardMaterial` | 降级为默认材质（距离材质无视觉属性可映射） |
| `Material`（基类）| `MeshStandardMaterial` | 仅保留 color/opacity/side/transparent |
| `null / undefined` | `null` | 返回 null，上层使用默认 fallback |
| `Material[]`（多材质）| `Material[]` | 递归处理每个元素 |

### 5.3 `MeshPhongMaterial` → `MeshStandardMaterial` 映射

```typescript
function phongToStandard(src: THREE.MeshPhongMaterial): THREE.MeshStandardMaterial {
  const dst = new THREE.MeshStandardMaterial()

  // 直接映射
  dst.color.copy(src.color)
  dst.map = src.map
  dst.lightMap = src.lightMap
  dst.lightMapIntensity = src.lightMapIntensity
  dst.aoMap = src.aoMap
  dst.aoMapIntensity = src.aoMapIntensity
  dst.emissive.copy(src.emissive)
  dst.emissiveMap = src.emissiveMap
  dst.emissiveIntensity = src.emissiveIntensity
  dst.bumpMap = src.bumpMap
  dst.bumpScale = src.bumpScale
  dst.normalMap = src.normalMap
  dst.normalScale.copy(src.normalScale)
  dst.displacementMap = src.displacementMap
  dst.displacementScale = src.displacementScale
  dst.displacementBias = src.displacementBias
  dst.alphaMap = src.alphaMap
  dst.transparent = src.transparent
  dst.opacity = src.opacity
  dst.side = src.side
  dst.wireframe = src.wireframe
  dst.vertexColors = src.vertexColors
  dst.fog = src.fog

  // Phong specularMap → Standard roughnessMap（反相近似）:
  //   specular 亮 → 光滑 → roughness 低
  //   使用 onBeforeCompile 或直接跳过（简单映射丢失空间信息）
  //   当前方案：不映射 specularMap，用 uniform roughness 近似
  if (src.specularMap) {
    // specularMap 无法精确映射到 roughnessMap（语义不同），
    // 保留 specular 颜色的 uniform 近似
  }

  // Phong → PBR 转换：
  //   shininess: 0-1000, 越高光泽越强
  //   roughness: 0-1, 越低光泽越强
  //   近似: roughness ≈ 1 - (shininess / 1000) ^ 0.5
  dst.roughness = 1 - Math.sqrt(Math.min(src.shininess, 1000) / 1000)

  //   specular color → metalness 近似：
  //   白色 specular → 高 metalness，暗 specular → 低 metalness
  const specLuminance = 0.2126 * src.specular.r + 0.7152 * src.specular.g + 0.0722 * src.specular.b
  dst.metalness = Math.min(specLuminance, 1.0)

  dst.envMap = src.envMap
  dst.envMapIntensity = src.envMapIntensity

  dst.needsUpdate = true
  return dst
}
```

### 5.4 `MeshLambertMaterial` → `MeshStandardMaterial` 映射

Lambert 是纯漫反射材质，没有镜面高光。

```typescript
function lambertToStandard(src: THREE.MeshLambertMaterial): THREE.MeshStandardMaterial {
  const dst = new THREE.MeshStandardMaterial()
  // 复制所有共有属性
  dst.color.copy(src.color)
  dst.map = src.map
  dst.lightMap = src.lightMap
  dst.lightMapIntensity = src.lightMapIntensity
  dst.aoMap = src.aoMap
  dst.aoMapIntensity = src.aoMapIntensity
  dst.emissive.copy(src.emissive)
  dst.emissiveMap = src.emissiveMap
  dst.emissiveIntensity = src.emissiveIntensity
  dst.bumpMap = src.bumpMap
  dst.bumpScale = src.bumpScale
  dst.normalMap = src.normalMap
  dst.normalScale.copy(src.normalScale)
  dst.alphaMap = src.alphaMap
  dst.transparent = src.transparent
  dst.opacity = src.opacity
  dst.side = src.side
  dst.vertexColors = src.vertexColors
  dst.fog = src.fog

  // Lambert 没有高光 → 高粗糙度 + 无金属感
  dst.roughness = 0.9
  dst.metalness = 0.0

  dst.needsUpdate = true
  return dst
}
```

### 5.5 `MeshBasicMaterial` → `MeshStandardMaterial` 映射

Basic 不受光照影响，是最简材质。

```typescript
function basicToStandard(src: THREE.MeshBasicMaterial): THREE.MeshStandardMaterial {
  const dst = new THREE.MeshStandardMaterial()
  dst.color.copy(src.color)
  dst.map = src.map
  dst.alphaMap = src.alphaMap
  dst.transparent = src.transparent
  dst.opacity = src.opacity
  dst.side = src.side
  dst.vertexColors = src.vertexColors
  dst.fog = src.fog

  // Basic 不受光 → 用粗糙漫反射近似
  dst.roughness = 1.0
  dst.metalness = 0.0

  dst.needsUpdate = true
  return dst
}
```

### 5.6 纹理克隆

`Material.clone()` 共享纹理引用而非深度拷贝纹理数据。这是期望的行为（避免重复解码图像数据），但要求我们在 dispose 时谨慎处理——确保每个纹理只 dispose 一次。

Three.js 的 `Material.clone()` 会复制纹理引用：
- `dst.map = src.map`（同一 Texture 对象）
- 安全，因为 Texture 是引用类型
- dispose 时，只销毁最后一个引用

**纹理 colorSpace**：Three.js 0.184+ 使用 `texture.colorSpace` 替代已废弃的 `texture.encoding`。`GLTFLoader` 会自动设置颜色纹理为 `SRGBColorSpace`，法线/粗糙度/金属度等线性纹理保持 `LinearSRGBColorSpace`。`Material.clone()` 共享纹理引用，colorSpace 会正确保留。

### 5.7 其他材质类型转换

#### `MeshToonMaterial` → `MeshStandardMaterial`

```typescript
function toonToStandard(src: THREE.MeshToonMaterial): THREE.MeshStandardMaterial {
  const dst = new THREE.MeshStandardMaterial()
  dst.color.copy(src.color)
  dst.map = src.map
  dst.gradientMap = src.gradientMap  // 保留卡通渐变作为备查
  dst.alphaMap = src.alphaMap
  dst.transparent = src.transparent
  dst.opacity = src.opacity
  dst.side = src.side
  dst.vertexColors = src.vertexColors
  dst.fog = src.fog
  dst.emissive.copy(src.emissive)
  dst.emissiveMap = src.emissiveMap
  dst.emissiveIntensity = src.emissiveIntensity
  dst.bumpMap = src.bumpMap
  dst.bumpScale = src.bumpScale
  dst.normalMap = src.normalMap
  dst.normalScale.copy(src.normalScale)
  dst.lightMap = src.lightMap
  dst.lightMapIntensity = src.lightMapIntensity
  dst.aoMap = src.aoMap
  dst.aoMapIntensity = src.aoMapIntensity
  // Toon 无金属/粗糙度 → 默认漫反射
  dst.roughness = 0.6
  dst.metalness = 0.0
  dst.needsUpdate = true
  return dst
}
```

#### `MeshMatcapMaterial` → `MeshStandardMaterial`

Matcap 使用预烘焙光照贴图，不依赖场景光照。转换为 Standard 时近似为粗糙漫反射。

```typescript
function matcapToStandard(src: THREE.MeshMatcapMaterial): THREE.MeshStandardMaterial {
  const dst = new THREE.MeshStandardMaterial()
  dst.color.copy(src.color)
  dst.map = src.map
  // matcap 贴图无法等价映射到 PBR，丢弃
  dst.alphaMap = src.alphaMap
  dst.transparent = src.transparent
  dst.opacity = src.opacity
  dst.side = src.side
  dst.vertexColors = src.vertexColors
  dst.fog = src.fog
  dst.roughness = 1.0
  dst.metalness = 0.0
  dst.needsUpdate = true
  return dst
}
```

### 5.8 实现代码骨架：`cloneMaterial.ts`

```typescript
import * as THREE from 'three'

export function cloneAndConvertMaterial(
  src: THREE.Material | THREE.Material[] | null | undefined,
): THREE.Material | THREE.Material[] | null {
  if (src == null) return null
  if (Array.isArray(src)) {
    return src.map((m) => convertSingle(m))
  }
  return convertSingle(src)
}

function convertSingle(src: THREE.Material): THREE.Material {
  if (src instanceof THREE.MeshPhysicalMaterial) return src.clone()
  if (src instanceof THREE.MeshStandardMaterial) return src.clone()
  if (src instanceof THREE.MeshPhongMaterial) return phongToStandard(src)
  if (src instanceof THREE.MeshLambertMaterial) return lambertToStandard(src)
  if (src instanceof THREE.MeshBasicMaterial) return basicToStandard(src)
  if (src instanceof THREE.MeshToonMaterial) return toonToStandard(src)
  if (src instanceof THREE.MeshNormalMaterial) return src.clone()
  if (src instanceof THREE.MeshMatcapMaterial) return matcapToStandard(src)
  // Fallback: try clone, or create default
  try {
    return src.clone()
  } catch {
    return createDefaultMaterial()
  }
}
```

---

## 6. 默认材质策略

当 Mesh 没有材质时（`material === null / undefined`，或源文件格式本身不带材质如 STL），分配一个合理的默认 PBR 材质。

### 6.1 UI 设计系统分析

系统 CSS 变量（light 主题）与 Three.js 色值的对应关系：

| CSS 变量 | oklch 色值 | 说明 |
|-----------|-----------|------|
| `--background` | `oklch(96% 0.008 200)` | 极浅冷灰蓝背景 |
| `--card` | `oklch(99% 0.004 200)` | 近白表面/卡片 |
| `--foreground` | `oklch(20% 0.025 210)` | 深色文字，微蓝 |
| `--muted-foreground` | `oklch(50% 0.015 210)` | 中灰次要文字 |
| `--primary` | `oklch(52% 0.12 185)` | 青绿色主色 |
| `--accent` | `oklch(38% 0.08 225)` | 蓝色强调色 |

整体风格：**冷色调、低彩度、干净极简**。3D 材质和光照应与此融和。

### 6.2 默认材质设计

材质应满足：
- 与冷色 UI 背景相邻但不融合（有足够的明度/色相差）
- 偏冷色系以融入 UI，但比 UI 元素略"有色彩"以体现"物体"感
- 细微金属质感，符合 CAD 工程视觉习惯

**推荐色值**（基于 oklch 推导）：

| 属性 | 值 | 推导依据 |
|--------|-------|-------------|
| 明度 | `65%` | 比 background (96%) 明显暗，比 foreground (20%) 明显亮——作为物体颜色与背景拉开距离 |
| 彩度 | `0.02` | 略高于 UI 中性色，带一点色彩但不过分 |
| 色相 | `210` | 与 UI 色相一致，冷色调 |
| Roughness | `0.35` | 轻微粗糙，漫反射为主 |
| Metalness | `0.1` | 细微金属感，接近工程塑料/铝合金质感 |

```typescript
// Light theme 默认材质
export function createDefaultMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial()
  // oklch(65% 0.02 210) ≈ #9BA6AE
  mat.color.setHex(0x9BA6AE)
  mat.roughness = 0.35
  mat.metalness = 0.1
  // 使用 FrontSide（Three.js 默认），CAD 模型一般为封闭实体
  // 如果源材质明确设置了 DoubleSide，cloneAndConvertMaterial 会保留该设置
  mat.side = THREE.FrontSide
  mat.needsUpdate = true
  return mat
}
```

> 使用 `FrontSide` 而非 `DoubleSide`：CAD 模型通常是封闭实体，双面渲染会导致法线方向不一致时的 z-fighting 和错误的光照计算。对于确实需要双面渲染的模型（如布料、叶片），源材质会设置 `side: DoubleSide`，`cloneAndConvertMaterial` 会保留该设置。

#### Dark 主题（推导）

当前 dark `--background` = `oklch(20% 0.02 210)` ≈ `#1e293b`。
- 明度 `~35%`，色相 `210`，彩度 `0.02`
- 反光更强：roughness 可降到 `0.3`，metalness 保持 `0.1`
- 对应色值 ≈ `#4D5762`

### 6.3 对比验证

| 方案 | 与 light background 对比度 | 评价 |
|--------|---------------------|--------|
| 当前 `#cccccc` | 明度差约 16pp | 太亮太跳，偏暖灰 |
| `#9BA6AE`（新方案） | 明度差 31pp，色相一致 | **融入 UI 系统** |

### 6.4 各格式默认材质策略

| 格式 | 材质策略 |
|--------|-------------|
| `stl` / `ply` / `vtk` / `drc` / `md2` | 默认材质 |
| `obj` / `dae` / `3mf` / `fbx` / `3ds` | 优先使用文件自带材质，无材质则降级到默认 |
| `glb` / `gltf` | 优先使用 GLB 材质，无材质降级到默认 |
| STEP 转换的 GLB (`step`) | 转换过程中已生成材质（`GlbBuilder.addMaterial`），应有 `baseColor` |

---

## 7. 材质生命周期管理

### 7.1 创建

材质在 `useEffect` 加载阶段创建，通过 `cloneAndConvertMaterial()` 从源 Mesh 克隆/转换得到。

### 7.2 更新

当 `buffer` / `format` 变化触发重新加载时，旧的材质需要被清理。使用 ref 追踪已创建的材质以避免 race condition：

```typescript
const materialsRef = useRef<(THREE.Material | THREE.Material[] | null)[]>([])

// 在 useEffect 的 cleanup 中
return () => {
  cancelled = true
  // 清理当前追踪的材质（通过 ref 同步获取，避免闭包过期）
  for (const mat of materialsRef.current) {
    disposeMaterial(mat)
  }
  materialsRef.current = []
}
```

**Race condition 防范**：`useEffect` cleanup 闭包捕获的是旧 `meshMaterials` state 值。使用 `materialsRef` 在每次成功加载后同步更新（`materialsRef.current = materials`），确保 cleanup 总是 dispose 正确的材质。

### 7.3 Dispose 工具函数

`disposeMaterial` 需要递归处理纹理：

```typescript
function disposeMaterial(mat: THREE.Material | THREE.Material[] | null): void {
  if (mat == null) return
  if (Array.isArray(mat)) {
    mat.forEach((m) => disposeMaterialSingle(m))
    return
  }
  disposeMaterialSingle(mat)
}

function disposeMaterialSingle(mat: THREE.Material): void {
  // 释放所有纹理
  for (const key of Object.keys(mat)) {
    const value = (mat as Record<string, unknown>)[key]
    if (value instanceof THREE.Texture) {
      value.dispose()
    }
  }
  mat.dispose()
}
```

### 7.4 注意：纹理引用共享

`Material.clone()` 共享纹理引用（浅拷贝）。这意味：
- 多个克隆材质可能引用同一纹理对象
- dispose 时多次 dispose 同一纹理是安全的（WebGL 会忽略已删除的纹理）
- 推荐在 `ModelGroup` 卸载时统一通过 `disposeMaterial` 释放

### 7.5 透明材质的渲染顺序

当模型包含多个 `transparent: true` 材质时，需要正确设置 `renderOrder` 以确保从后到前的绘制顺序：

```typescript
// 在加载阶段，为透明材质设置递增的 renderOrder
let renderOrderCounter = 0
for (const mat of materials) {
  if (isTransparent(mat)) {
    mat.renderOrder = renderOrderCounter++
    mat.depthWrite = false  // 透明物体通常不写深度
  }
}
```

---

## 8. Canvas 与场景配置：UI 系统集成

### 8.1 Canvas 背景色

当前 `ViewportContainer.tsx:208-213` 的 canvas 背景色需要对齐 UI 设计系统：

| 主题 | 当前值 | 目标值（对应 CSS 变量） |
|-------|-----------|-------------------|
| light | `#f8f8f8`（偏暖灰） | `#EEF3F5`（对应 `--background: oklch(96% 0.008 200)`） |
| dark | `#1a1a2e` | 保持（与 dark `--background: oklch(20% 0.02 210)` 接近） |

```typescript
// ViewportContainer.tsx
const canvasBackground = useMemo(() => {
  const isDark = theme === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : theme === 'dark'
  return isDark ? '#1a1a2e' : '#EEF3F5'
}, [theme])
```

### 8.2 色彩管理

当前 R3F `<Canvas>` 没有配置 `outputColorSpace` 和 `toneMapping`。增加配置以匹配 UI 系统的高品质视觉：

```typescript
<Canvas
  gl={{
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.0,
  }}
  scene={{ background: canvasBackground }}
  // ...
>
```

> `toneMappingExposure=1.0`（不使用缩略图的 1.2）因 UI 系统 bg 较浅，过曝会削弱物体与背景的区分。

### 8.3 光照设计

光照需平衡：
1. **物体辨识** — 默认材质 `#9BA6AE` 在 `#EEF3F5` bg 上需要足够明暗对比
2. **UI 协调** — 光色不应与 UI 冷调冲突
3. **PBR 表现** — 金属度/粗糙度需要适当的高光和阴影来体现

#### 光照方案（light 主题）

```typescript
{/* 环境光：柔和的冷白光，照亮暗部 */}
<ambientLight color="#D4E1E8" intensity={0.5} />

{/* 主光：中暖白，从上前方照射 */}
<directionalLight color="#FFF5EE" intensity={1.2} position={[5, 5, 10]} />

{/* 补光：冷蓝，从左下方补充，色相接近 UI --accent */}
<directionalLight color="#C0D4E8" intensity={0.6} position={[-3, 2, -5]} />

{/* 背光：强调轮廓，使用 UI --primary 色相 */}
<directionalLight color="#8FD6D6" intensity={0.3} position={[0, 5, -5]} />
```

| 光源 | 色温/色调 | 意图 |
|---------|-------------|---------|
| Ambient `#D4E1E8` | 冷灰蓝 hue~200 | 整体冷调环境，匹配 `--background` |
| Key `#FFF5EE` | 暖白 | 给冷色材质带来温暖感，避免过于冰冷 |
| Fill `#C0D4E8` | 冷蓝 hue~210 | 与 UI `--accent` 色相一致 |
| Rim `#8FD6D6` | 青绿 hue~185 | 与 UI `--primary` 色相一致，勾勒轮廓 |

#### Dark 主题光照

```typescript
<ambientLight color="#4A5B6E" intensity={0.4} />
<directionalLight color="#FFF5EE" intensity={1.0} position={[5, 5, 10]} />
<directionalLight color="#6B8EAD" intensity={0.5} position={[-3, 2, -5]} />
<directionalLight color="#4DB6B6" intensity={0.4} position={[0, 5, -5]} />
```

> Dark 主题下各光色保持色相一致但降低明度，环境光带色以提供"暗光环境"的氛围感。

#### 光照示意图

```
                    Key (暖白，上前方)
                  ↘
                    ↘
    Rim (青绿)  →  [ 模型 ]  ←  Ambient (全局冷白)
                    ↗
                  ↗
              Fill (冷蓝，左下方)
```

### 8.4 环境贴图（可选增强）

对于高金属度模型，环境贴图能显著提升视觉质量。`@react-three/drei` 的 `<Environment>` 组件：

```typescript
import { Environment } from '@react-three/drei'

// 在 SceneSetup 中
<Environment preset="city" background={false} />
```

> `preset="city"` 提供冷色城市夜景环境反射，与 UI 冷调匹配。

**与源材质 envMap 的冲突处理**：如果源 GLB 材质自带 `envMap`，`cloneAndConvertMaterial` 会通过 `Material.clone()` 保留它。此时优先使用源材质的 envMap，不强制覆盖。`<Environment>` 仅作为全局 fallback 环境反射，其作用等价于 `scene.environment`。Three.js 中，材质 `envMap` 优先于 `scene.environment`，所以不会冲突。

### 8.5 缩略图管道同步

`thumbnailGenerator.ts` 当前使用独立灯光配置。建议同步以保持缩略图和 canvas 视觉效果一致：

```typescript
// thumbnailGenerator.ts 灯光（同步主视图）
const ambient = new THREE.AmbientLight(0xD4E1E8, 0.5)
const dir1 = new THREE.DirectionalLight(0xFFF5EE, 1.2)
dir1.position.set(1, 1, 1)
const dir2 = new THREE.DirectionalLight(0xC0D4E8, 0.6)
dir2.position.set(-0.5, -0.3, -1)
const dir3 = new THREE.DirectionalLight(0x8FD6D6, 0.3)
dir3.position.set(0, 0.5, -0.5)
```

---

## 9. 显示模式兼容设计

### 9.1 各模式行为

| 模式 | 说明 | 材质策略 |
|--------|------|-------------|
| `solid` | 完整 PBR 渲染 | 使用原始材质（有材质时）或默认材质（无材质时） |
| `solidWithWireframe` | 实体面 + 拓扑特征线 | 同 solid + DebugTopologyOverlay 叠加 |
| `wireframe` | 拓扑边缘线框（仅 STEP 等有拓扑的格式） | 原始材质隐藏（colorWrite=false, depthWrite=true），由 DebugTopologyOverlay 绘制特征线 |
| `mesh` | 三角网格线条（所有格式可用） | `EdgesGeometry` + `lineSegments`，线条颜色从原始材质提取 |
| `debug` | 同 `mesh` + 顶点/边调试叠加 | 同 `mesh` + DebugTopologyOverlay |

**核心原则**：
- `wireframe` 模式显示**特征边/拓扑边**（STEP 几何引擎导出的边界线），仅部分格式有，依赖 `DebugTopologyOverlay`
- `mesh` 模式显示**三角网格边**（所有格式可用），使用 `EdgesGeometry` + `LineSegments`
- `solidWithWireframe` 模式在完整 PBR 渲染的基础上叠加拓扑特征线

#### `wireframe` 模式具体实现

```typescript
if (displayMode === 'wireframe') {
  return (
    <group ref={...}>
      {glbMeshes.map((mesh, i) => {
        const partId = glbPartInfos[i]?.partId || `part-${i}`
        const vis = visibilityMap.get(partId) ?? true
        return (
          <mesh
            key={i}
            visible={vis}
            geometry={mesh.geometry}
            position={mesh.position}
            material={meshMaterials[i] ?? undefined}
          >
            {/* 隐藏原始材质，保留 depth 信息供线框遮挡 */}
            <meshBasicMaterial
              color="#cccccc"
              transparent
              opacity={0}
              depthWrite={true}
              colorWrite={false}
            />
          </mesh>
        )
      })}
    </group>
  )
}
```

> 关键：`depthWrite={true}`（非 false）确保不可见 mesh 写入深度缓冲，DebugTopologyOverlay 的线条才能正确进行深度测试，模型背面的线条会被前面的面遮挡。

#### `mesh` 模式具体实现

对所有格式都有三角网格可显示。使用 `EdgesGeometry`（`thresholdAngle=1` 显示所有三角边）+ `LineSegments`，线条颜色继承原始材质的颜色以区分零部件：

```typescript
if (displayMode === 'mesh') {
  return (
    <group ref={...}>
      {glbMeshes.map((mesh, i) => {
        const partId = glbPartInfos[i]?.partId || `part-${i}`
        const vis = visibilityMap.get(partId) ?? true
        const matColor = getMaterialColor(meshMaterials[i]) ?? '#cccccc'
        return (
          <lineSegments
            key={i}
            visible={vis}
            position={mesh.position}
          >
            <edgesGeometry args={[mesh.geometry, 1]} />
            <lineBasicMaterial color={matColor} />
          </lineSegments>
        )
      })}
    </group>
  )
}
```

> `EdgesGeometry` 需要在加载阶段预计算并 memoize，避免每帧创建新 Geometry。`getMaterialColor()` 提取材质主色，有纹理时取 fallback。

#### `solidWithWireframe` 模式

实体面使用原始 PBR 材质渲染，同时叠加 `DebugTopologyOverlay`：

```typescript
// ViewportContainer.tsx — 条件渲染 DebugTopologyOverlay
{(resolvedDisplayMode === 'wireframe' || resolvedDisplayMode === 'solidWithWireframe'
  || resolvedDisplayMode === 'debug') && hasEdges && (
  <DebugTopologyOverlay ... />
)}
```

#### `debug` 模式

同 `mesh` 模式（显示三角网格线），额外依赖 `DebugTopologyOverlay` 组件显示顶点/边调试信息。

### 9.2 纯几何体格式（STL 等单合并 Mesh）

对于 `mergedGeometry` 路径（STL/PLY/VTK/DRC 等），仍然使用默认材质逻辑：

```typescript
// mergedGeometry 路径
<mesh geometry={mergedGeometry}>
  <meshStandardMaterial
    color="#9BA6AE"
    roughness={0.35}
    metalness={0.1}
    wireframe={isMeshOnly}
  />
</mesh>
```

---

## 10. GlbPartInfo 扩展

当前 `GlbPartInfo` 不含材质信息。建议新增材质元数据字段（可选，用于 UI 显示材质信息）：

```typescript
export interface GlbPartInfo {
  partId: string
  meshIndex: number
  name: string
  triangleCount: number

  // 新增（可选）
  materialName?: string          // 材质名称（glTF material.name）
  materialType?: string          // 'standard' | 'physical' | 'phong' | 'lambert' | 'basic' | 'default'
  hasTexture?: boolean           // 是否有纹理贴图
  color?: [number, number, number]  // 主色 RGB
}
```

---

## 11. 影响范围与注意事项

### 11.1 正面影响

| 方面 | 效果 |
|--------|--------|
| 视觉保真度 | 原始 GLB 模型颜色/纹理/材质质感完全保留 |
| 一致性 | 缩略图和 canvas 渲染一致 |
| STEP 材质 | STEP→GLB 转换的材质（`GlbBuilder` 生成的 PBR）现在可以被正确渲染 |
| CAD 灰色 | STL/PLY 等纯几何格式使用更中性美观的默认材质 |
| 数据完整性 | morphAttributes 和蒙皮属性不再被粗暴丢弃 |

### 11.2 注意事项/风险

| 风险 | 缓解措施 |
|------|-------------|
| 内存增加 | 材质 + 纹理副本增加内存占用。Three.js 纹理引用共享可缓解 |
| 大纹理解码耗时 | 纹理在 `GLTFLoader.parseAsync()` 时已解码，不增加额外负载 |
| `Material.clone()` 共享纹理 | dispose 时避免重复 dispose，使用 `disposeMaterial` 统一管理 |
| MeshBasicMaterial 大量使用 | Basic 不受光照，转换后 Standard 材质可能变暗。光照配置补偿 |
| 蒙皮模型 | 使用 `skinning: true` + `SkinnedMesh`，而非删除蒙皮属性 |
| 性能 | 多材质增加 draw call。每个材质 = 1 draw call。对 GLB 模型，这是预期的 |
| 透明材质渲染顺序 | 设置 `renderOrder` 和 `depthWrite=false` 确保正确叠加 |

### 11.3 不影响的模块

- `thumbnailGenerator.ts` — 已正确处理材质，仅需同步光照颜色
- `formatLoaders.ts` — 已正确返回材质，仅需扩展 `LoaderResult` 接口
- `SceneSetup.tsx` — 光照可独立调整
- Topology / Selection — 不影响几何体层面的处理

---

## 12. 实施步骤建议

### Phase 1：修复几何体粗暴处理

1. `cloneMeshGeometry.ts`: 保留 `morphAttributes`，新增 `initMorphTargets()` helper
2. `ModelGroup.tsx`: 停止删除蒙皮属性，改为检测并设置 `skinning: true`

### Phase 2：核心材质支持

1. 创建 `src/renderer/engine/components/cloneMaterial.ts`
   - `cloneAndConvertMaterial()`
   - `createDefaultMaterial()`
   - `disposeMaterial()`
   - `getMaterialColor()`
   - 各材质类型转换函数
2. `ModelGroup.tsx`: 新增 `meshMaterials` 状态
3. `ModelGroup.tsx` 加载循环：调用 `cloneAndConvertMaterial` + `initMorphTargets`
4. `ModelGroup.tsx` JSX：solid/solidWithWireframe 模式使用 `material` prop，wireframe/mesh 模式正确配置

### Phase 3：色彩管理与光照升级

1. `ViewportContainer.tsx`: R3F `<Canvas>` 添加 `outputColorSpace` + `toneMapping`
2. `SceneSetup.tsx`: 优化为 4 光源 PBR 配置
3. `thumbnailGenerator.ts`: 同步光照颜色

### Phase 4：默认材质与 STEP 管线

1. 统一所有纯几何格式的默认材质（STL/PLY/VTK/DRC/MD2）
2. 更新 `mergedGeometry` 路径使用新的默认材质
3. `GlbBuilder.addMaterial()` 添加 optional PBR 参数

### Phase 5：UI 集成（可选）

1. 在 `GlbPartInfo` 中添加材质信息
2. 模型树/属性面板显示材质信息
3. 材质覆写 UI（允许用户切换回灰色显示）

---

## 13. 测试策略

| 测试场景 | 验证点 | 测试方法 |
|-------------|---------|--------|
| PBR GLB（RobotExpressive） | 颜色与缩略图一致 | 视觉回归 + 像素采样 |
| 无材质 GLB | 使用默认材质 | 断言材质属性 |
| MeshPhongMaterial GLTF | 正确转换为 Standard | Unit test cloneMaterial |
| Multi-material Mesh | 每个 material group 正确 | 断言 material 数组长度 |
| Wireframe 模式 | 覆盖材质不影响原始数据 | state 不变性检查 |
| 模型切换 | 旧材质被 dispose | mock dispose 计数 |
| 透明度 | alpha 正确渲染 | 视觉检查 |
| Texture GLB | 纹理正确显示 | 视觉检查 |
| STEP→GLB | 保留 GlbBuilder 生成的材质 | 集成测试 |
| Morph targets | morphAttributes 保留，不崩溃 | 单元测试 |
| Skinning 属性 | skinIndex 等保留，skinning=true | 单元测试 |

---

## 14. 架构决策记录

### 决策 1：clone 材质而非保留引用

- **选项 A**：保留 `src.material` 引用 → 简化但可能被后续操作污染
- **选项 B**：`cloneAndConvertMaterial()` 深拷贝 → **采纳**，避免副作用

### 决策 2：state 传递材质而非 ref

- **选项 A**：`useRef<Material[]>` → 避免 React 重渲染开销
- **选项 B**：`useState<Material[]>` → **采纳**，确保 R3F 能在材质变化时正确 reconciliation

### 决策 3：Solid 模式用 `material` prop，override 模式用子节点

- **选项 A**：始终用 `material` prop + 运行时修改 material.wireframe
- **选项 B**：solid 用 `material` prop，override 用子节点 → **采纳**，更符合 R3F 声明式范式

### 决策 4：非 PBR 材质转换到 Standard 而非混合渲染

- **选项 A**：保留原始材质类型，让 Three.js 混合渲染 → 渲染器状态切换增加性能开销
- **选项 B**：统一转为 `MeshStandardMaterial` → **采纳**，单一代码路径，性能最优

### 决策 5：保留 morphAttributes 和蒙皮属性，而非删除

- **选项 A**：删除 `morphAttributes` + 蒙皮属性，避免配置复杂性 → 数据丢失
- **选项 B**：保留属性，用 `initMorphTargets()` + `skinning: true` 正确配置 → **采纳**，数据完整性优先
