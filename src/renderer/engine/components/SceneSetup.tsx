export default function SceneSetup() {
  return (
    <>
      {/* Ambient illumination for all sides */}
      <ambientLight color="#ffffff" intensity={0.6} />
      {/* Key light from front-right-top */}
      <directionalLight color="#ffffff" intensity={0.8} position={[5, -5, 10]} />
    </>
  )
}