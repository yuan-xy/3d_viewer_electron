# 多级场景树支持方案

## 现状

### 数据模型（已支持多级）
`model-store.ts` 中 `SceneTreeNode` 已定义了多级结构：
```ts
export interface SceneTreeNode {
  id: string
  name: string
  children?: SceneTreeNode[]  // ✅ 已支持
  visible: boolean
}
```

### 当前实现问题
1. **`ModelGroup.tsx:166-171`**：构建 sceneTree 时将所有 mesh 扁平化为单层数组，丢失层级信息
2. **`DesktopLayout.tsx:155-166`**：渲染时只遍历顶层 `model.sceneTree`，不递归渲染 `children`
3. **`loadFormat`**（`formatLoaders.ts`）：GLTFLoader 解析后只提取 mesh 列表，不保留场景层级

### 影响
- 模型文件即使包含多级层级结构（如房间含家具、角色含肢体），加载后只剩扁平零件列表
- 无法按层级展开/折叠、批量控制可见性

---

## 方案

### 核心改动：保留场景层级

GLTF/GLB 格式的场景图本身是多级树结构（`THREE.Group` → `children`）。当前 `loadFormat` 只提取 mesh，丢弃了父节点信息。改为从 `gltf.scene` 直接构建层级结构。

### 1. 修改 `loadFormat`（formatLoaders.ts）

GLB/GLTF 格式返回时，额外返回完整场景层级：

```ts
export interface LoaderResult {
  meshes: THREE.Mesh[]
  objects: THREE.Object3D[]
  skeleton?: THREE.Skeleton
  // 新增：保留场景层级用于 sceneTree
  sceneRoot?: THREE.Object3D
}
```

在 `case 'glb'/'gltf':` 分支，不再 `extractMeshes` 提取为扁平数组，而是保留 `gltf.scene` 作为 `sceneRoot` 返回。同时仍然提取 `meshes` 供现有渲染逻辑使用。

### 2. 修改 `ModelGroup`（ModelGroup.tsx）

**a. 从 `sceneRoot` 递归构建 `sceneTree`**

```ts
function buildSceneTree(node: THREE.Object3D): SceneTreeNode[] {
  return node.children.map((child, i) => {
    const hasMesh = child instanceof THREE.Mesh
    return {
      id: child.uuid || `node-${i}`,
      name: child.name || (hasMesh ? 'Mesh' : 'Group'),
      visible: child.visible,
      children: buildSceneTree(child),
    }
  })
}
```

**b. 层级可见性控制**

`SceneTreeNode.visible` 控制该节点及所有子节点的可见性。渲染时通过 `mesh.visible = node.visible` 实现。

### 3. 修改 `DesktopLayout`（DesktopLayout.tsx）

将平铺渲染改为**可折叠的递归树组件**：

- 展开/折叠图标（chevron）
- 缩进表示层级深度
- 点击切换选中高亮
- 眼睛图标（Eye/EyeOff）控制该节点及子节点的可见性
- 递归渲染 `children`

**新功能** — 眼睛图标控制可见性：
```
▼ Room                            👁
    ▼ Furniture                   👁
        ▼ Chair                   👁
            Legs                  👁
            Seat                  👁
        Table                     👁
    ▼ Lighting                    👁
        Lamp                      👁
```

注意：当层次很深，名称很长时，可以左侧组件显示不下。此时要自动增加一个底部自动出现横向滚动条。而👁的位置不受影响。

### 4. 修改 `model-store.ts`

扩展 `SceneTreeNode` 增加可选属性：

```ts
export interface SceneTreeNode {
  id: string
  name: string
  children?: SceneTreeNode[]
  visible: boolean
  // 新增
  expanded?: boolean    // UI 展开状态
  meshIndex?: number   // 如果是 mesh，对应 glbPartInfos 的索引
}
```

---

## 测试模型

**明确使用** `RobotExpressive.glb` 作为测试模型：
- 路径：`C:\git\three.js\examples\models\gltf\RobotExpressive\RobotExpressive.glb`
- 特点：骨骼/角色层级结构，包含多个子节点（head, torso, arms, legs 等），适合验证多级树渲染和可见性控制

### 测试步骤
1. 将 `RobotExpressive.glb` 复制到项目 `public/models/` 目录（已完成）
2. 实现上述改动后，加载该模型
3. 验证场景栏显示多级树结构，可展开/折叠
4. 验证可见性控制正确性（眼睛图标切换显示/隐藏）

---

## 实施顺序

1. **修改 `loadFormat`**：让 GLB/GLTF 返回 `sceneRoot`
2. **修改 `ModelGroup`**：构建层级 sceneTree，传递 `sceneRoot` 给渲染层
3. **修改 `model-store`**：扩展 SceneTreeNode 支持展开状态和 meshIndex 映射
4. **修改 `DesktopLayout`**：实现递归树渲染组件
5. **测试验证**：使用 `RobotExpressive.glb` 测试多级结构。要编写集成测试实际验证功能正常。

---

## 关键文件清单

| 文件 | 改动类型 |
|------|---------|
| `src/renderer/engine/formatLoaders.ts` | 修改 `LoaderResult` 接口，`glb/gltf` case 返回 `sceneRoot` |
| `src/renderer/engine/components/ModelGroup.tsx` | 从 `sceneRoot` 递归构建 sceneTree，层级可见性控制 |
| `src/renderer/stores/model-store.ts` | 扩展 `SceneTreeNode` 接口 |
| `src/renderer/layouts/DesktopLayout.tsx` | 替换平铺渲染为递归树组件 |

## 完成后移植到ficad_web项目
../ficad_web项目也需要类似的功能，移植过去。