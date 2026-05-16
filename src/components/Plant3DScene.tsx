import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { PlantMapObject } from '../types'

type MeshMaterial = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | THREE.SpriteMaterial

type Plant3DSceneProps = {
  objects: PlantMapObject[]
  editing: boolean
  selectedObjectId: string
  onObjectMove: (objectId: string, x: number, z: number) => void
  onObjectSelect: (objectId: string) => void
}

const OBJECT_SPECS: Record<string, { length?: number; width?: number; depth?: number; height?: number; scaleX?: number; scaleZ?: number; tone?: 'default' | 'process' | 'dispatch' | 'scale' }> = {
  'stockpile-wet': { scaleX: 1.3, scaleZ: 0.95 },
  'stockpile-washed': { scaleX: 1.5, scaleZ: 1.1 },
  'mcc-room': { width: 1.35, depth: 1, tone: 'process' },
  'belt-cinta-23': { length: 7.2, height: 1.05 },
  'belt-feed': { length: 5.4, height: 1.65 },
  'belt-transfer': { length: 7.8, height: 1.95 },
  'belt-dispatch': { length: 5.4, height: 1.2 },
  'screen-house': { width: 2.65, depth: 2.25, height: 1.65 },
  'process-cabin': { width: 1.6, depth: 1.05, tone: 'process' },
  'silo-a': { height: 3.7 },
  'silo-b': { height: 4.3 },
  'silo-c': { height: 4.1 },
  'silo-d': { height: 3.5 },
  'dispatch-cabin': { width: 1.5, depth: 1.05, tone: 'dispatch' },
  'truck-scale-1': { length: 4.5 },
  'truck-scale-2': { length: 4.5 },
  'scale-cabin-1': { width: 1.15, depth: 0.9, tone: 'scale' },
  'scale-cabin-2': { width: 1.15, depth: 0.9, tone: 'scale' },
}

const SCENE_LIMIT = 18

function getObjectScale(object: PlantMapObject) {
  if (!Number.isFinite(object.scale)) return 1
  return Math.min(3, Math.max(0.25, object.scale))
}

function applyObjectScale(group: THREE.Group, object: PlantMapObject, selected: boolean) {
  group.scale.setScalar(getObjectScale(object) * (selected ? 1.08 : 1))
}

export function Plant3DScene({ objects, editing, selectedObjectId, onObjectMove, onObjectSelect }: Plant3DSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const groupsRef = useRef(new Map<string, THREE.Group>())
  const pickTargetsRef = useRef<THREE.Object3D[]>([])
  const editingRef = useRef(editing)
  const selectedObjectIdRef = useRef(selectedObjectId)
  const onObjectMoveRef = useRef(onObjectMove)
  const onObjectSelectRef = useRef(onObjectSelect)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    editingRef.current = editing
  }, [editing])

  useEffect(() => {
    selectedObjectIdRef.current = selectedObjectId
    groupsRef.current.forEach((group, objectId) => {
      const object = objects.find((item) => item.id === objectId)
      if (!object) return
      const selected = objectId === selectedObjectId
      applyObjectScale(group, object, selected)
    })
  }, [objects, selectedObjectId])

  useEffect(() => {
    onObjectMoveRef.current = onObjectMove
    onObjectSelectRef.current = onObjectSelect
  }, [onObjectMove, onObjectSelect])

  useEffect(() => {
    objects.forEach((object) => {
      const group = groupsRef.current.get(object.id)
      if (!group) return
      group.position.x = object.x
      group.position.z = object.z
      group.rotation.y = object.rotationY
      applyObjectScale(group, object, object.id === selectedObjectIdRef.current)
    })
  }, [objects])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined

    let renderer: THREE.WebGLRenderer | null = null
    let controls: OrbitControls | null = null
    let frameId = 0
    let resizeObserver: ResizeObserver | null = null
    let draggingObjectId = ''
    let dragOffset = new THREE.Vector3()
    let lastDragPosition = new THREE.Vector3()
    const geometries: THREE.BufferGeometry[] = []
    const materials: MeshMaterial[] = []
    const textures: THREE.Texture[] = []
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

    const geometry = <T extends THREE.BufferGeometry>(item: T) => {
      geometries.push(item)
      return item
    }

    const material = (options: THREE.MeshStandardMaterialParameters) => {
      const item = new THREE.MeshStandardMaterial(options)
      materials.push(item)
      return item
    }

    const updatePointer = (event: PointerEvent, camera: THREE.Camera) => {
      if (!renderer) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
    }

    try {
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120)
      camera.position.set(22, 16, 24)
      camera.lookAt(0, 0, 0)

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.domElement.className = 'plant-map-webgl-canvas'
      mount.appendChild(renderer.domElement)

      controls = new OrbitControls(camera, renderer.domElement)
      controls.target.set(0, 0, 0)
      controls.enableDamping = true
      controls.dampingFactor = 0.08
      controls.enablePan = false
      controls.rotateSpeed = 0.55
      controls.zoomSpeed = 0.65
      controls.minDistance = 10
      controls.maxDistance = 46
      controls.minPolarAngle = 0.42
      controls.maxPolarAngle = Math.PI / 2.12

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
      const scaleCabinMat = material({ color: 0xd8dee8, roughness: 0.56, metalness: 0.04 })
      const roofMat = material({ color: 0x7b8488, roughness: 0.52, metalness: 0.16 })
      const stockMat = material({ color: 0xb87a32, roughness: 0.92, metalness: 0.01 })
      const concrete = material({ color: 0xd6d2c8, roughness: 0.78, metalness: 0.02 })
      const greenZone = material({ color: 0x5c9a68, roughness: 0.9, transparent: true, opacity: 0.3 })
      const orangeZone = material({ color: 0xff5949, roughness: 0.9, transparent: true, opacity: 0.22 })
      const amberZone = material({ color: 0xc98500, roughness: 0.9, transparent: true, opacity: 0.24 })
      const greyZone = material({ color: 0x666a70, roughness: 0.9, transparent: true, opacity: 0.18 })

      function addMesh(mesh: THREE.Mesh, parent = plant, objectId = '') {
        mesh.castShadow = true
        mesh.receiveShadow = true
        if (objectId) {
          mesh.userData.objectId = objectId
          pickTargetsRef.current.push(mesh)
        }
        parent.add(mesh)
        return mesh
      }

      function addLabel(text: string, x: number, y: number, z: number, scale = 1, parent = plant) {
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
        parent.add(sprite)
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

      function createObjectGroup(object: PlantMapObject) {
        const group = new THREE.Group()
        group.position.set(object.x, 0, object.z)
        group.rotation.y = object.rotationY
        applyObjectScale(group, object, object.id === selectedObjectIdRef.current)
        group.userData.objectId = object.id
        plant.add(group)
        groupsRef.current.set(object.id, group)
        return group
      }

      function addBelt(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const spec = OBJECT_SPECS[object.id] || {}
        const length = spec.length || 5
        const height = spec.height || 1.1
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length, 0.28, 0.72)), beltBlack), group, object.id).position.set(0, height, 0)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length * 0.9, 0.08, 0.16)), beltAccent), group, object.id).position.set(0, height + 0.2, -0.39)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length * 0.96, 0.06, 0.94)), darkSteel), group, object.id).position.set(0, height - 0.24, 0)
        const supportCount = Math.max(3, Math.round(length / 2.4))
        for (let index = 0; index < supportCount; index += 1) {
          const supportX = -length / 2 + (index + 0.5) * (length / supportCount)
          addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(0.12, height, 0.12)), darkSteel), group, object.id).position.set(supportX, height / 2, -0.28)
          addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(0.12, height, 0.12)), darkSteel), group, object.id).position.set(supportX, height / 2, 0.28)
        }
        addLabel(object.label, 0, height + 0.95, 0, 0.72, group)
      }

      function addKiln(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const body = new THREE.Mesh(geometry(new THREE.CylinderGeometry(0.72, 0.72, 4.3, 48)), kilnMat)
        body.position.y = 1.35
        body.rotation.z = Math.PI / 2
        addMesh(body, group, object.id)
        const leftCap = new THREE.Mesh(geometry(new THREE.CylinderGeometry(0.76, 0.76, 0.18, 48)), kilnCap)
        leftCap.position.set(-2.25, 1.35, 0)
        leftCap.rotation.z = Math.PI / 2
        addMesh(leftCap, group, object.id)
        const rightCap = new THREE.Mesh(geometry(new THREE.CylinderGeometry(0.76, 0.76, 0.18, 48)), kilnCap)
        rightCap.position.set(2.25, 1.35, 0)
        rightCap.rotation.z = Math.PI / 2
        addMesh(rightCap, group, object.id)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(5, 0.14, 1.55)), darkSteel), group, object.id).position.set(0, 0.47, 0)
        addLabel(object.label, 0, 2.85, 0, 0.78, group)
      }

      function addSilo(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const height = OBJECT_SPECS[object.id]?.height || 3.7
        const body = new THREE.Mesh(geometry(new THREE.CylinderGeometry(0.62, 0.68, height, 48)), siloMat)
        body.position.y = 1.05 + height / 2
        addMesh(body, group, object.id)
        const top = new THREE.Mesh(geometry(new THREE.CylinderGeometry(0.66, 0.66, 0.18, 48)), steel)
        top.position.y = 1.05 + height + 0.12
        addMesh(top, group, object.id)
        const hopper = new THREE.Mesh(geometry(new THREE.ConeGeometry(0.7, 1.1, 48)), hopperMat)
        hopper.position.y = 0.58
        hopper.rotation.x = Math.PI
        addMesh(hopper, group, object.id)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(1.5, 0.16, 1.5)), concrete), group, object.id).position.y = 0.05
        addLabel(object.label, 0, height + 2.25, 0, 0.65, group)
      }

      function addCabin(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const spec = OBJECT_SPECS[object.id] || {}
        const width = spec.width || 1.35
        const depth = spec.depth || 1
        const cabinMaterial = spec.tone === 'dispatch' ? dispatchCabinMat : spec.tone === 'scale' ? scaleCabinMat : cabinMat
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(width, 1.2, depth)), cabinMaterial), group, object.id).position.y = 0.65
        const roof = new THREE.Mesh(geometry(new THREE.BoxGeometry(width + 0.18, 0.16, depth + 0.32)), roofMat)
        roof.position.y = 1.35
        roof.rotation.z = 0.05
        addMesh(roof, group, object.id)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(width * 0.32, 0.36, 0.04)), steel), group, object.id).position.set(-width * 0.18, 0.82, depth / 2 + 0.025)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(width * 0.32, 0.36, 0.04)), steel), group, object.id).position.set(width * 0.22, 0.82, depth / 2 + 0.025)
        addLabel(object.label, 0, 2.15, 0, 0.58, group)
      }

      function addStockpile(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const spec = OBJECT_SPECS[object.id] || {}
        const pile = new THREE.Mesh(geometry(new THREE.ConeGeometry(1.4, 1.45, 7)), stockMat)
        pile.position.y = 0.72
        pile.scale.set(spec.scaleX || 1.3, 1, spec.scaleZ || 1)
        pile.rotation.y = 0.5
        addMesh(pile, group, object.id)
        addLabel(object.label, 0, 1.85, 0, 0.58, group)
      }

      function addDispatchBin(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const hopper = new THREE.Mesh(geometry(new THREE.ConeGeometry(0.88, 1.35, 4)), hopperMat)
        hopper.position.y = 1.2
        hopper.rotation.x = Math.PI
        hopper.rotation.y = Math.PI / 4
        addMesh(hopper, group, object.id)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(1.35, 0.2, 1.35)), greenZone), group, object.id).position.y = 1.9
        addLabel(object.label, 0, 2.75, 0, 0.48, group)
      }

      function addTruckScale(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const length = OBJECT_SPECS[object.id]?.length || 4.5
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length, 0.22, 1.2)), concrete), group, object.id).position.y = 0.14
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length - 0.4, 0.08, 0.08)), steel), group, object.id).position.set(0, 0.34, -0.45)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length - 0.4, 0.08, 0.08)), steel), group, object.id).position.set(0, 0.34, 0.45)
        addLabel(object.label, 0, 1.3, 0, 0.65, group)
      }

      function addStructure(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const spec = OBJECT_SPECS[object.id] || {}
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(spec.width || 2.65, spec.height || 1.65, spec.depth || 2.25)), steel), group, object.id).position.y = (spec.height || 1.65) / 2
        addLabel(object.label, 0, (spec.height || 1.65) + 0.9, 0, 0.68, group)
      }

      function addEditableObject(object: PlantMapObject) {
        if (object.objectType === 'belt') addBelt(object)
        else if (object.objectType === 'kiln') addKiln(object)
        else if (object.objectType === 'silo') addSilo(object)
        else if (object.objectType === 'cabin') addCabin(object)
        else if (object.objectType === 'stockpile') addStockpile(object)
        else if (object.objectType === 'dispatch_bin') addDispatchBin(object)
        else if (object.objectType === 'truck_scale') addTruckScale(object)
        else addStructure(object)
      }

      addBox(35, 0.18, 24, 0, 0, concrete, 0, -0.09)
      const grid = new THREE.GridHelper(35, 35, 0xb9b2a8, 0xd9d3c9)
      grid.position.y = 0.025
      plant.add(grid)
      addZone(5.7, 4.8, -7.3, -1.6, amberZone)
      addZone(8, 5.6, -1.6, -1.8, orangeZone)
      addZone(6.6, 5.8, 6.3, -1.5, greenZone)
      addZone(9.8, 2.7, 4.8, 4.65, greyZone)
      addBox(20, 0.06, 1.45, 4.4, 4.95, asphalt, -0.12, 0.06)
      addBox(19, 0.05, 0.78, -1.8, 2.95, asphalt, -0.28, 0.06)
      addBox(0.08, 0.07, 17, 7.6, 0.9, asphalt, 0.14, 0.07)
      objects.forEach(addEditableObject)
      addLabel('Planta de secado y despacho', -2.4, 5.7, -5.55, 0.95)

      const handlePointerDown = (event: PointerEvent) => {
        if (!renderer) return
        updatePointer(event, camera)
        const hit = raycaster.intersectObjects(pickTargetsRef.current, false)[0]
        const objectId = hit?.object.userData.objectId as string | undefined
        if (!objectId) return
        onObjectSelectRef.current(objectId)
        if (!editingRef.current) return
        const group = groupsRef.current.get(objectId)
        if (!group) return
        const planeHit = new THREE.Vector3()
        if (!raycaster.ray.intersectPlane(groundPlane, planeHit)) return
        draggingObjectId = objectId
        dragOffset = group.position.clone().sub(planeHit)
        lastDragPosition = group.position.clone()
        controls!.enabled = false
        renderer.domElement.setPointerCapture(event.pointerId)
      }

      const handlePointerMove = (event: PointerEvent) => {
        if (!draggingObjectId) return
        updatePointer(event, camera)
        const planeHit = new THREE.Vector3()
        if (!raycaster.ray.intersectPlane(groundPlane, planeHit)) return
        const group = groupsRef.current.get(draggingObjectId)
        if (!group) return
        const nextPosition = planeHit.add(dragOffset)
        group.position.x = Math.min(SCENE_LIMIT, Math.max(-SCENE_LIMIT, nextPosition.x))
        group.position.z = Math.min(SCENE_LIMIT, Math.max(-SCENE_LIMIT, nextPosition.z))
        lastDragPosition = group.position.clone()
      }

      const finishDrag = (event: PointerEvent) => {
        if (!draggingObjectId) return
        onObjectMoveRef.current(draggingObjectId, lastDragPosition.x, lastDragPosition.z)
        draggingObjectId = ''
        controls!.enabled = true
        if (renderer?.domElement.hasPointerCapture(event.pointerId)) {
          renderer.domElement.releasePointerCapture(event.pointerId)
        }
      }

      renderer.domElement.addEventListener('pointerdown', handlePointerDown)
      renderer.domElement.addEventListener('pointermove', handlePointerMove)
      renderer.domElement.addEventListener('pointerup', finishDrag)
      renderer.domElement.addEventListener('pointercancel', finishDrag)

      const render = () => {
        const elapsed = performance.now() / 1000
        keyLight.position.x = -8 + Math.sin(elapsed * 0.28) * 0.35
        controls?.update()
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

      return () => {
        renderer?.domElement.removeEventListener('pointerdown', handlePointerDown)
        renderer?.domElement.removeEventListener('pointermove', handlePointerMove)
        renderer?.domElement.removeEventListener('pointerup', finishDrag)
        renderer?.domElement.removeEventListener('pointercancel', finishDrag)
        if (frameId) window.cancelAnimationFrame(frameId)
        resizeObserver?.disconnect()
        controls?.dispose()
        if (renderer?.domElement.parentElement === mount) mount.removeChild(renderer.domElement)
        geometries.forEach((item) => item.dispose())
        materials.forEach((item) => item.dispose())
        textures.forEach((item) => item.dispose())
        renderer?.dispose()
        groupsRef.current.clear()
        pickTargetsRef.current = []
      }
    } catch (error) {
      console.error('No se pudo inicializar el modelo 3D de planta:', error)
      setFailed(true)
    }

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId)
      resizeObserver?.disconnect()
      controls?.dispose()
      if (renderer?.domElement.parentElement === mount) mount.removeChild(renderer.domElement)
      geometries.forEach((item) => item.dispose())
      materials.forEach((item) => item.dispose())
      textures.forEach((item) => item.dispose())
      renderer?.dispose()
      groupsRef.current.clear()
      pickTargetsRef.current = []
    }
  }, [])

  if (failed) {
    return <div className="plant-map-webgl-fallback">No se pudo cargar el modelo 3D en este navegador.</div>
  }

  return <div className="plant-map-webgl" ref={mountRef} aria-label="Modelo 3D de la planta" />
}
