import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

type MeshMaterial = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | THREE.SpriteMaterial

export function Plant3DScene() {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined

    let renderer: THREE.WebGLRenderer | null = null
    let frameId = 0
    let resizeObserver: ResizeObserver | null = null
    const geometries: THREE.BufferGeometry[] = []
    const materials: MeshMaterial[] = []
    const textures: THREE.Texture[] = []

    const geometry = <T extends THREE.BufferGeometry>(item: T) => {
      geometries.push(item)
      return item
    }

    const material = (options: THREE.MeshStandardMaterialParameters) => {
      const item = new THREE.MeshStandardMaterial(options)
      materials.push(item)
      return item
    }

    try {
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120)
      camera.position.set(15, 12, 17)
      camera.lookAt(0, 0, 0)

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      renderer.outputColorSpace = THREE.SRGBColorSpace
      mount.appendChild(renderer.domElement)

      const plant = new THREE.Group()
      plant.rotation.y = -0.15
      scene.add(plant)

      const ambient = new THREE.HemisphereLight(0xfff4e8, 0x1d2230, 2.2)
      scene.add(ambient)

      const keyLight = new THREE.DirectionalLight(0xffffff, 2.9)
      keyLight.position.set(-8, 18, 12)
      keyLight.castShadow = true
      keyLight.shadow.mapSize.set(2048, 2048)
      keyLight.shadow.camera.near = 1
      keyLight.shadow.camera.far = 55
      keyLight.shadow.camera.left = -20
      keyLight.shadow.camera.right = 20
      keyLight.shadow.camera.top = 20
      keyLight.shadow.camera.bottom = -20
      scene.add(keyLight)

      const rimLight = new THREE.DirectionalLight(0xff6a4d, 1.15)
      rimLight.position.set(14, 8, -10)
      scene.add(rimLight)

      const asphalt = material({ color: 0x4b4c50, roughness: 0.82, metalness: 0.02 })
      const beltBlack = material({ color: 0x17151a, roughness: 0.58, metalness: 0.18 })
      const beltAccent = material({ color: 0xff5949, roughness: 0.5, metalness: 0.05 })
      const steel = material({ color: 0xaeb6b4, roughness: 0.42, metalness: 0.24 })
      const darkSteel = material({ color: 0x54565c, roughness: 0.55, metalness: 0.32 })
      const kilnMat = material({ color: 0xd85f4f, roughness: 0.48, metalness: 0.12 })
      const kilnCap = material({ color: 0x6b3835, roughness: 0.7, metalness: 0.08 })
      const siloMat = material({ color: 0xdfe7e1, roughness: 0.35, metalness: 0.28 })
      const hopperMat = material({ color: 0x8fa094, roughness: 0.62, metalness: 0.14 })
      const cabinMat = material({ color: 0xcbdde2, roughness: 0.55, metalness: 0.04 })
      const dispatchCabinMat = material({ color: 0xb8d2a7, roughness: 0.58, metalness: 0.04 })
      const roofMat = material({ color: 0x7b8488, roughness: 0.52, metalness: 0.16 })
      const stockMat = material({ color: 0xb87a32, roughness: 0.92, metalness: 0.01 })
      const concrete = material({ color: 0xd6d2c8, roughness: 0.78, metalness: 0.02 })
      const greenZone = material({ color: 0x5c9a68, roughness: 0.9, transparent: true, opacity: 0.3 })
      const orangeZone = material({ color: 0xff5949, roughness: 0.9, transparent: true, opacity: 0.22 })
      const amberZone = material({ color: 0xc98500, roughness: 0.9, transparent: true, opacity: 0.24 })
      const greyZone = material({ color: 0x666a70, roughness: 0.9, transparent: true, opacity: 0.18 })

      function addMesh(mesh: THREE.Mesh, parent = plant) {
        mesh.castShadow = true
        mesh.receiveShadow = true
        parent.add(mesh)
        return mesh
      }

      function addLabel(text: string, x: number, y: number, z: number, scale = 1) {
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (!context) return
        const pixelRatio = 2
        const paddingX = 22
        const paddingY = 12
        context.font = '700 34px Arial, sans-serif'
        const textWidth = Math.ceil(context.measureText(text).width)
        canvas.width = (textWidth + paddingX * 2) * pixelRatio
        canvas.height = (34 + paddingY * 2) * pixelRatio
        context.scale(pixelRatio, pixelRatio)
        context.font = '700 34px Arial, sans-serif'
        context.fillStyle = 'rgba(12, 11, 17, 0.82)'
        context.fillRect(0, 0, canvas.width / pixelRatio, canvas.height / pixelRatio)
        context.strokeStyle = 'rgba(255, 89, 73, 0.95)'
        context.lineWidth = 2
        context.strokeRect(1, 1, canvas.width / pixelRatio - 2, canvas.height / pixelRatio - 2)
        context.fillStyle = '#f8f6ef'
        context.textBaseline = 'middle'
        context.fillText(text, paddingX, canvas.height / pixelRatio / 2)
        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        textures.push(texture)
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
        materials.push(spriteMaterial)
        const sprite = new THREE.Sprite(spriteMaterial)
        sprite.position.set(x, y, z)
        sprite.scale.set((canvas.width / pixelRatio / 85) * scale, (canvas.height / pixelRatio / 85) * scale, 1)
        sprite.renderOrder = 10
        plant.add(sprite)
      }

      function addBox(width: number, height: number, depth: number, x: number, z: number, meshMaterial: THREE.Material, rotationY = 0, y = height / 2) {
        const mesh = new THREE.Mesh(geometry(new THREE.BoxGeometry(width, height, depth)), meshMaterial)
        mesh.position.set(x, y, z)
        mesh.rotation.y = rotationY
        return addMesh(mesh)
      }

      function addZone(width: number, depth: number, x: number, z: number, meshMaterial: THREE.Material) {
        const mesh = new THREE.Mesh(geometry(new THREE.BoxGeometry(width, 0.05, depth)), meshMaterial)
        mesh.position.set(x, 0.02, z)
        mesh.receiveShadow = true
        plant.add(mesh)
      }

      function addBelt(label: string, x: number, z: number, length: number, rotationY: number, height = 1.1) {
        const group = new THREE.Group()
        group.position.set(x, 0, z)
        group.rotation.y = rotationY
        plant.add(group)

        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length, 0.28, 0.72)), beltBlack), group).position.set(0, height, 0)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length * 0.9, 0.08, 0.16)), beltAccent), group).position.set(0, height + 0.2, -0.39)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length * 0.96, 0.06, 0.94)), darkSteel), group).position.set(0, height - 0.24, 0)

        const supportCount = Math.max(3, Math.round(length / 2.4))
        for (let index = 0; index < supportCount; index += 1) {
          const supportX = -length / 2 + (index + 0.5) * (length / supportCount)
          addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(0.12, height, 0.12)), darkSteel), group).position.set(supportX, height / 2, -0.28)
          addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(0.12, height, 0.12)), darkSteel), group).position.set(supportX, height / 2, 0.28)
        }
        addLabel(label, x, height + 0.95, z, 0.72)
      }

      function addKiln(label: string, x: number, z: number, rotationY: number) {
        const group = new THREE.Group()
        group.position.set(x, 1.35, z)
        group.rotation.y = rotationY
        plant.add(group)
        const body = new THREE.Mesh(geometry(new THREE.CylinderGeometry(0.72, 0.72, 4.3, 48)), kilnMat)
        body.rotation.z = Math.PI / 2
        addMesh(body, group)
        const leftCap = new THREE.Mesh(geometry(new THREE.CylinderGeometry(0.76, 0.76, 0.18, 48)), kilnCap)
        leftCap.rotation.z = Math.PI / 2
        leftCap.position.x = -2.25
        addMesh(leftCap, group)
        const rightCap = leftCap.clone()
        rightCap.geometry = geometry(leftCap.geometry.clone())
        rightCap.position.x = 2.25
        addMesh(rightCap, group)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(5, 0.14, 1.55)), darkSteel), group).position.set(0, -0.88, 0)
        addLabel(label, x, 2.85, z, 0.78)
      }

      function addSilo(label: string, x: number, z: number, height: number) {
        const group = new THREE.Group()
        group.position.set(x, 0, z)
        plant.add(group)
        const body = new THREE.Mesh(geometry(new THREE.CylinderGeometry(0.62, 0.68, height, 48)), siloMat)
        body.position.y = 1.05 + height / 2
        addMesh(body, group)
        const top = new THREE.Mesh(geometry(new THREE.CylinderGeometry(0.66, 0.66, 0.18, 48)), steel)
        top.position.y = 1.05 + height + 0.12
        addMesh(top, group)
        const hopper = new THREE.Mesh(geometry(new THREE.ConeGeometry(0.7, 1.1, 48)), hopperMat)
        hopper.position.y = 0.58
        hopper.rotation.x = Math.PI
        addMesh(hopper, group)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(1.5, 0.16, 1.5)), concrete), group).position.y = 0.05
        addLabel(label, x, height + 2.25, z, 0.65)
      }

      function addCabin(label: string, x: number, z: number, width: number, depth: number, meshMaterial: THREE.Material) {
        const group = new THREE.Group()
        group.position.set(x, 0, z)
        group.rotation.y = -0.12
        plant.add(group)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(width, 1.2, depth)), meshMaterial), group).position.y = 0.65
        const roof = new THREE.Mesh(geometry(new THREE.BoxGeometry(width + 0.18, 0.16, depth + 0.32)), roofMat)
        roof.position.y = 1.35
        roof.rotation.z = 0.05
        addMesh(roof, group)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(width * 0.32, 0.36, 0.04)), steel), group).position.set(-width * 0.18, 0.82, depth / 2 + 0.025)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(width * 0.32, 0.36, 0.04)), steel), group).position.set(width * 0.22, 0.82, depth / 2 + 0.025)
        addLabel(label, x, 2.15, z, 0.58)
      }

      function addStockpile(label: string, x: number, z: number, width: number, depth: number) {
        const pile = new THREE.Mesh(geometry(new THREE.ConeGeometry(1.4, 1.45, 7)), stockMat)
        pile.position.set(x, 0.72, z)
        pile.scale.set(width, 1, depth)
        pile.rotation.y = 0.5
        addMesh(pile)
        addLabel(label, x, 1.85, z, 0.58)
      }

      function addDispatchBin(label: string, x: number, z: number) {
        const group = new THREE.Group()
        group.position.set(x, 0, z)
        plant.add(group)
        const hopper = new THREE.Mesh(geometry(new THREE.ConeGeometry(0.88, 1.35, 4)), hopperMat)
        hopper.position.y = 1.2
        hopper.rotation.x = Math.PI
        hopper.rotation.y = Math.PI / 4
        addMesh(hopper, group)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(1.35, 0.2, 1.35)), greenZone), group).position.y = 1.9
        addLabel(label, x, 2.75, z, 0.48)
      }

      function addTruckScale(label: string, x: number, z: number, rotationY: number) {
        const group = new THREE.Group()
        group.position.set(x, 0, z)
        group.rotation.y = rotationY
        plant.add(group)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(4.5, 0.22, 1.2)), concrete), group).position.y = 0.14
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(4.1, 0.08, 0.08)), steel), group).position.set(0, 0.34, -0.45)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(4.1, 0.08, 0.08)), steel), group).position.set(0, 0.34, 0.45)
        addLabel(label, x, 1.3, z, 0.65)
      }

      addBox(23.5, 0.18, 15, 0, 0, concrete, 0, -0.09)
      const grid = new THREE.GridHelper(23, 23, 0xb9b2a8, 0xd9d3c9)
      grid.position.y = 0.025
      plant.add(grid)

      addZone(5.7, 4.8, -7.3, -1.6, amberZone)
      addZone(8, 5.6, -1.6, -1.8, orangeZone)
      addZone(6.6, 5.8, 6.3, -1.5, greenZone)
      addZone(9.8, 2.7, 4.8, 4.65, greyZone)

      addBox(12.8, 0.06, 1.45, 4.4, 4.95, asphalt, -0.12, 0.06)
      addBox(12.2, 0.05, 0.78, -1.8, 2.95, asphalt, -0.28, 0.06)
      addBox(0.08, 0.07, 11, 7.6, 0.9, asphalt, 0.14, 0.07)

      addStockpile('Acopio humedo', -8.1, 0.55, 1.3, 0.95)
      addStockpile('Acopio lavado', -6.6, -2.2, 1.5, 1.1)
      addCabin('Sala MCC', -8.9, 3.05, 1.35, 1, cabinMat)

      addBelt('Cinta 23', -5.3, 1.3, 7.2, -0.24, 1.05)
      addBelt('Alimentacion hornos', -2.9, -0.4, 5.4, -0.62, 1.65)
      addBelt('Transferencia a silos', 2.9, -0.15, 7.8, 0.26, 1.95)
      addBelt('Cinta despacho', 6.5, 1.35, 5.4, -0.18, 1.2)

      addKiln('Horno 1', -3.4, -2.8, -0.12)
      addKiln('Horno 2', -0.65, -3.15, -0.12)
      addKiln('Horno 3', 2.1, -3.45, -0.12)
      addBox(2.65, 1.65, 2.25, -0.9, 0.9, steel, -0.16)
      addLabel('Zarandas', -0.9, 2.55, 0.9, 0.68)
      addCabin('Cabina proceso', 1.8, 1.1, 1.6, 1.05, cabinMat)

      addSilo('Silo A', 4.6, -2.65, 3.7)
      addSilo('Silo B', 6.1, -3.05, 4.3)
      addSilo('Silo C', 7.6, -3.18, 4.1)
      addSilo('Silo D', 9.1, -2.8, 3.5)
      addDispatchBin('D1', 4.6, 0.55)
      addDispatchBin('D2', 6.15, 0.25)
      addDispatchBin('D3', 7.7, -0.05)
      addDispatchBin('D4', 9.25, 0.25)
      addCabin('Cabina despacho', 9.6, 2.0, 1.5, 1.05, dispatchCabinMat)

      addTruckScale('Bascula 1', 3.4, 4.55, -0.12)
      addTruckScale('Bascula 2', 6.75, 5.05, -0.12)
      addCabin('Cabina B1', 1.35, 4.05, 1.15, 0.9, cabinMat)
      addCabin('Cabina B2', 9.25, 4.55, 1.15, 0.9, cabinMat)

      addLabel('Planta de secado y despacho', -2.4, 5.7, -5.55, 0.95)

      const render = () => {
        const elapsed = performance.now() / 1000
        keyLight.position.x = -8 + Math.sin(elapsed * 0.28) * 0.35
        renderer?.render(scene, camera)
        frameId = window.requestAnimationFrame(render)
      }

      const resize = () => {
        if (!renderer) return
        const width = Math.max(1, mount.clientWidth)
        const height = Math.max(1, mount.clientHeight)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setSize(width, height, false)
      }

      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(mount)
      resize()
      render()
    } catch (error) {
      console.error('No se pudo inicializar el modelo 3D de planta:', error)
      setFailed(true)
    }

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId)
      resizeObserver?.disconnect()
      if (renderer?.domElement.parentElement === mount) mount.removeChild(renderer.domElement)
      geometries.forEach((item) => item.dispose())
      materials.forEach((item) => item.dispose())
      textures.forEach((item) => item.dispose())
      renderer?.dispose()
    }
  }, [])

  if (failed) {
    return <div className="plant-map-webgl-fallback">No se pudo cargar el modelo 3D en este navegador.</div>
  }

  return <div className="plant-map-webgl" ref={mountRef} aria-label="Modelo 3D de la planta" />
}
