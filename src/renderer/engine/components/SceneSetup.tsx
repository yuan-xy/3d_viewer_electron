export default function SceneSetup() {
  return (
    <>
      {/* Ambient: cool off-white fill that matches UI --background */}
      <ambientLight color="#D4E1E8" intensity={0.5} />
      {/* Key: warm white from above-right-front */}
      <directionalLight color="#FFF5EE" intensity={1.2} position={[5, 5, 10]} />
      {/* Fill: cool blue from left-below, hue matches UI --accent */}
      <directionalLight color="#C0D4E8" intensity={0.6} position={[-3, 2, -5]} />
      {/* Rim: teal from behind-above, hue matches UI --primary */}
      <directionalLight color="#8FD6D6" intensity={0.3} position={[0, 5, -5]} />
    </>
  )
}
