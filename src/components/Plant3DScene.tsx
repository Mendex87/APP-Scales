import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { PlantMapObject } from '../types'

type MeshMaterial = THREE.Material

type Plant3DSceneProps = {
  objects: PlantMapObject[]
  editing: boolean
  selectedObjectId: string
  initialView?: PlantMapCameraView
  viewCommand?: PlantMapViewCommand | null
  onObjectMove: (objectId: string, x: number, z: number) => void
  onObjectSelect: (objectId: string) => void
  onObjectScreenPositionsChange?: (positions: Record<string, { x: number; y: number }>) => void
  onViewChange?: (view: PlantMapCameraView) => void
}

export type PlantMapCameraView = {
  position: [number, number, number]
  target: [number, number, number]
  zoom?: number
}

export type PlantMapViewCommand = {
  id: number
  view: PlantMapCameraView
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
const DEFAULT_CAMERA_VIEW: PlantMapCameraView = { position: [28, 20, 31], target: [0, 0, 0], zoom: 1 }

function applyCameraView(camera: THREE.PerspectiveCamera, controls: OrbitControls, view: PlantMapCameraView) {
  camera.position.set(...view.position)
  camera.zoom = view.zoom ?? 1
  camera.updateProjectionMatrix()
  controls.target.set(...view.target)
  controls.update()
}

function readCameraView(camera: THREE.PerspectiveCamera, controls: OrbitControls): PlantMapCameraView {
  return {
    position: [roundCameraValue(camera.position.x), roundCameraValue(camera.position.y), roundCameraValue(camera.position.z)],
    target: [roundCameraValue(controls.target.x), roundCameraValue(controls.target.y), roundCameraValue(controls.target.z)],
    zoom: roundCameraValue(camera.zoom),
  }
}

function roundCameraValue(value: number) {
  return Math.round(value * 1000) / 1000
}

function getObjectScale(object: PlantMapObject) {
  if (!Number.isFinite(object.scale)) return 1
  return Math.min(3, Math.max(0.25, object.scale))
}

function applyObjectScale(group: THREE.Group, object: PlantMapObject) {
  group.scale.setScalar(getObjectScale(object))
}

function getObjectColor(object: PlantMapObject, fallback: number) {
  try {
    return new THREE.Color(/^#[0-9a-f]{6}$/i.test(object.color) ? object.color : fallback)
  } catch {
    return new THREE.Color(fallback)
  }
}

export function Plant3DScene({ objects, editing, selectedObjectId, initialView, viewCommand, onObjectMove, onObjectSelect, onObjectScreenPositionsChange, onViewChange }: Plant3DSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const groupsRef = useRef(new Map<string, THREE.Group>())
  const pickTargetsRef = useRef<THREE.Object3D[]>([])
  const editingRef = useRef(editing)
  const selectedObjectIdRef = useRef(selectedObjectId)
  const onObjectMoveRef = useRef(onObjectMove)
  const onObjectSelectRef = useRef(onObjectSelect)
  const onObjectScreenPositionsChangeRef = useRef(onObjectScreenPositionsChange)
  const onViewChangeRef = useRef(onViewChange)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    editingRef.current = editing
  }, [editing])

  useEffect(() => {
    selectedObjectIdRef.current = selectedObjectId
    groupsRef.current.forEach((group, objectId) => {
      const object = objects.find((item) => item.id === objectId)
      if (!object) return
      applyObjectScale(group, object)
    })
  }, [objects, selectedObjectId])

  useEffect(() => {
    onObjectMoveRef.current = onObjectMove
    onObjectSelectRef.current = onObjectSelect
    onObjectScreenPositionsChangeRef.current = onObjectScreenPositionsChange
    onViewChangeRef.current = onViewChange
  }, [onObjectMove, onObjectScreenPositionsChange, onObjectSelect, onViewChange])

  useEffect(() => {
    if (!viewCommand || !cameraRef.current || !controlsRef.current) return
    applyCameraView(cameraRef.current, controlsRef.current, viewCommand.view)
    onViewChangeRef.current?.(readCameraView(cameraRef.current, controlsRef.current))
  }, [viewCommand])

  useEffect(() => {
    objects.forEach((object) => {
      const group = groupsRef.current.get(object.id)
      if (!group) return
      group.position.x = object.x
      group.position.y = object.elevation
      group.position.z = object.z
      group.rotation.y = object.rotationY
      applyObjectScale(group, object)
    })
  }, [objects])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined

    let renderer: THREE.WebGLRenderer | null = null
    let controls: OrbitControls | null = null
    let frameId = 0
    let disposed = false
    let resizeObserver: ResizeObserver | null = null
    let draggingObjectId = ''
    let dragOffset = new THREE.Vector3()
    let lastDragPosition = new THREE.Vector3()
    const geometries: THREE.BufferGeometry[] = []
    const materials: MeshMaterial[] = []
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
      const modelLoader = new GLTFLoader()
      cameraRef.current = camera

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.domElement.className = 'plant-map-webgl-canvas'
      mount.appendChild(renderer.domElement)

      controls = new OrbitControls(camera, renderer.domElement)
      controlsRef.current = controls
      controls.enableDamping = true
      controls.dampingFactor = 0.07
      controls.enablePan = true
      controls.rotateSpeed = 0.55
      controls.zoomSpeed = 0.65
      controls.panSpeed = 0.58
      controls.screenSpacePanning = true
      controls.minDistance = 8
      controls.maxDistance = 90
      controls.minPolarAngle = 0.08
      controls.maxPolarAngle = Math.PI / 2.08
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }
      controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }
      applyCameraView(camera, controls, initialView || DEFAULT_CAMERA_VIEW)

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

      function objectMaterial(object: PlantMapObject, fallback: number, options: THREE.MeshStandardMaterialParameters = {}) {
        return material({ color: getObjectColor(object, fallback), roughness: 0.58, metalness: 0.08, ...options })
      }

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

      function getModelPath(object: PlantMapObject) {
        const modelPath = object.modelPath.trim()
        return /\.(glb|gltf)(?:[?#].*)?$/i.test(modelPath) ? modelPath : ''
      }

      function registerLoadedModel(root: THREE.Object3D, objectId: string) {
        root.traverse((child) => {
          const mesh = child as THREE.Mesh
          if (!mesh.isMesh) return
          mesh.castShadow = true
          mesh.receiveShadow = true
          mesh.userData.objectId = objectId
          pickTargetsRef.current.push(mesh)
          if (mesh.geometry) geometries.push(mesh.geometry)
          const meshMaterial = mesh.material
          if (Array.isArray(meshMaterial)) materials.push(...meshMaterial)
          else if (meshMaterial) materials.push(meshMaterial)
        })
      }

      function disposeLoadedModel(root: THREE.Object3D) {
        root.traverse((child) => {
          const mesh = child as THREE.Mesh
          if (!mesh.isMesh) return
          mesh.geometry?.dispose()
          const meshMaterial = mesh.material
          if (Array.isArray(meshMaterial)) meshMaterial.forEach((item) => item.dispose())
          else meshMaterial?.dispose()
        })
      }

      function fitLoadedModel(root: THREE.Object3D, object: PlantMapObject) {
        const box = new THREE.Box3().setFromObject(root)
        if (box.isEmpty()) return
        const size = new THREE.Vector3()
        const center = new THREE.Vector3()
        box.getSize(size)
        box.getCenter(center)
        const scaleOptions = [
          size.x > 0 ? (object.width || 1) / size.x : Number.POSITIVE_INFINITY,
          size.y > 0 ? (object.height || 1) / size.y : Number.POSITIVE_INFINITY,
          size.z > 0 ? (object.depth || 1) / size.z : Number.POSITIVE_INFINITY,
        ].filter(Number.isFinite)
        const modelScale = Math.max(0.001, scaleOptions.length > 0 ? Math.min(...scaleOptions) : 1)
        root.scale.setScalar(modelScale)
        root.position.set(-center.x * modelScale, -box.min.y * modelScale, -center.z * modelScale)
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
        group.position.set(object.x, object.elevation, object.z)
        group.rotation.y = object.rotationY
        applyObjectScale(group, object)
        group.userData.objectId = object.id
        plant.add(group)
        groupsRef.current.set(object.id, group)
        return group
      }

      function addBelt(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const spec = OBJECT_SPECS[object.id] || {}
        const length = object.width || spec.length || 5
        const depth = object.depth || 0.75
        const height = object.height || spec.height || 0.9
        const beltMaterial = objectMaterial(object, 0x17151a, { roughness: 0.5, metalness: 0.16 })
        const deck = new THREE.Group()
        deck.position.y = Math.abs(Math.sin(object.slope || 0) * length * 0.5) + 0.03
        deck.rotation.z = object.slope || 0
        group.add(deck)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length, 0.28, depth)), beltMaterial), deck, object.id).position.set(0, height, 0)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length * 0.9, 0.08, Math.max(0.12, depth * 0.18))), beltAccent), deck, object.id).position.set(0, height + 0.2, -depth * 0.54)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length * 0.96, 0.06, depth + 0.22)), darkSteel), deck, object.id).position.set(0, height - 0.24, 0)
        const supportCount = Math.max(2, Math.round(length / 2.4))
        for (let index = 0; index < supportCount; index += 1) {
          const supportX = -length / 2 + (index + 0.5) * (length / supportCount)
          addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(0.12, height, 0.12)), darkSteel), group, object.id).position.set(supportX, height / 2, -depth * 0.34)
          addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(0.12, height, 0.12)), darkSteel), group, object.id).position.set(supportX, height / 2, depth * 0.34)
        }
      }

      function addKiln(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const length = object.width || 4.3
        const radius = Math.max(0.25, (object.depth || 1.45) / 2)
        const bodyMaterial = objectMaterial(object, 0xd85f4f, { roughness: 0.48, metalness: 0.12 })
        const body = new THREE.Mesh(geometry(new THREE.CylinderGeometry(radius, radius, length, 48)), bodyMaterial)
        body.position.y = Math.max(0.5, object.height || 1.35)
        body.rotation.z = Math.PI / 2
        addMesh(body, group, object.id)
        const leftCap = new THREE.Mesh(geometry(new THREE.CylinderGeometry(radius + 0.04, radius + 0.04, 0.18, 48)), kilnCap)
        leftCap.position.set(-length / 2 - 0.05, body.position.y, 0)
        leftCap.rotation.z = Math.PI / 2
        addMesh(leftCap, group, object.id)
        const rightCap = new THREE.Mesh(geometry(new THREE.CylinderGeometry(radius + 0.04, radius + 0.04, 0.18, 48)), kilnCap)
        rightCap.position.set(length / 2 + 0.05, body.position.y, 0)
        rightCap.rotation.z = Math.PI / 2
        addMesh(rightCap, group, object.id)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length + 0.6, 0.14, radius * 2 + 0.2)), darkSteel), group, object.id).position.set(0, 0.47, 0)
      }

      function addSilo(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const height = object.height || OBJECT_SPECS[object.id]?.height || 3.7
        const width = object.width || 1.45
        const depth = object.depth || 1.45
        const bodyMaterial = objectMaterial(object, 0xdfe7e1, { roughness: 0.35, metalness: 0.2 })
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(width, height, depth)), bodyMaterial), group, object.id).position.y = 0.75 + height / 2
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(width + 0.16, 0.18, depth + 0.16)), steel), group, object.id).position.y = 0.75 + height + 0.12
        addMesh(new THREE.Mesh(geometry(new THREE.ConeGeometry(Math.max(width, depth) * 0.55, 0.9, 4)), hopperMat), group, object.id).position.y = 0.42
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(width + 0.25, 0.16, depth + 0.25)), concrete), group, object.id).position.y = 0.05
      }

      function addCabin(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const spec = OBJECT_SPECS[object.id] || {}
        const width = object.width || spec.width || 1.35
        const depth = object.depth || spec.depth || 1
        const height = object.height || 1.2
        const fallback = spec.tone === 'dispatch' ? 0xb8d2a7 : spec.tone === 'scale' ? 0xd8dee8 : 0xcbdde2
        const cabinMaterial = objectMaterial(object, fallback, { roughness: 0.55, metalness: 0.04 })
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(width, height, depth)), cabinMaterial), group, object.id).position.y = height / 2 + 0.05
        const roof = new THREE.Mesh(geometry(new THREE.BoxGeometry(width + 0.18, 0.16, depth + 0.32)), roofMat)
        roof.position.y = height + 0.18
        roof.rotation.z = 0.05
        addMesh(roof, group, object.id)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(width * 0.32, height * 0.3, 0.04)), steel), group, object.id).position.set(-width * 0.18, height * 0.68, depth / 2 + 0.025)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(width * 0.32, height * 0.3, 0.04)), steel), group, object.id).position.set(width * 0.22, height * 0.68, depth / 2 + 0.025)
      }

      function addStockpile(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const spec = OBJECT_SPECS[object.id] || {}
        const pileMaterial = objectMaterial(object, 0xb87a32, { roughness: 0.92, metalness: 0.01 })
        const pile = new THREE.Mesh(geometry(new THREE.ConeGeometry(1, object.height || 1.45, 7)), pileMaterial)
        pile.position.y = (object.height || 1.45) / 2
        pile.scale.set(object.width / 2 || spec.scaleX || 1.3, 1, object.depth / 2 || spec.scaleZ || 1)
        pile.rotation.y = 0.5
        addMesh(pile, group, object.id)
      }

      function addDispatchBin(object: PlantMapObject) {
        addBelt({ ...object, width: object.width || 2.1, depth: object.depth || 0.85, height: object.height || 0.65, slope: object.slope || 0.22 })
      }

      function addTruckScale(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const length = object.width || OBJECT_SPECS[object.id]?.length || 4.5
        const depth = object.depth || 1.2
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length, object.height || 0.22, depth)), concrete), group, object.id).position.y = (object.height || 0.22) / 2
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length - 0.4, 0.08, 0.08)), steel), group, object.id).position.set(0, (object.height || 0.22) + 0.12, -depth * 0.38)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length - 0.4, 0.08, 0.08)), steel), group, object.id).position.set(0, (object.height || 0.22) + 0.12, depth * 0.38)
      }

      function addStructure(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const spec = OBJECT_SPECS[object.id] || {}
        const width = object.width || spec.width || 2.65
        const height = object.height || spec.height || 1.65
        const depth = object.depth || spec.depth || 2.25
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(width, height, depth)), objectMaterial(object, 0xaeb6b4, { roughness: 0.52, metalness: 0.12 })), group, object.id).position.y = height / 2
      }

      function addHopper(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const width = object.width || 1.7
        const depth = object.depth || 1.7
        const height = object.height || 1.8
        const hopper = new THREE.Mesh(geometry(new THREE.ConeGeometry(Math.max(width, depth) * 0.5, height, 4)), objectMaterial(object, 0x8fa094, { roughness: 0.62, metalness: 0.14 }))
        hopper.position.y = height / 2
        hopper.rotation.x = Math.PI
        hopper.rotation.y = Math.PI / 4
        addMesh(hopper, group, object.id)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(width, 0.18, depth)), darkSteel), group, object.id).position.y = height + 0.12
      }

      function addTruck(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const length = object.width || 3.9
        const depth = object.depth || 1.25
        const height = object.height || 0.7
        const truckMat = objectMaterial(object, 0xd6d2c8, { roughness: 0.5, metalness: 0.08 })
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length * 0.62, height, depth)), truckMat), group, object.id).position.set(-length * 0.12, height / 2 + 0.28, 0)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(length * 0.26, height * 0.95, depth * 0.9)), truckMat), group, object.id).position.set(length * 0.36, height / 2 + 0.38, 0)
        for (const wheelX of [-length * 0.35, 0, length * 0.38]) {
          addMesh(new THREE.Mesh(geometry(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 20)), darkSteel), group, object.id).position.set(wheelX, 0.22, -depth * 0.48)
          addMesh(new THREE.Mesh(geometry(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 20)), darkSteel), group, object.id).position.set(wheelX, 0.22, depth * 0.48)
        }
      }

      function addYard(object: PlantMapObject) {
        const group = createObjectGroup(object)
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(object.width || 5, object.height || 0.08, object.depth || 3.2)), objectMaterial(object, 0x4b4c50, { roughness: 0.82, metalness: 0.02 })), group, object.id).position.y = (object.height || 0.08) / 2
      }

      function addFloor(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const isZone = object.objectType === 'zone'
        const floorMat = objectMaterial(object, isZone ? 0xc98500 : 0xd6d2c8, {
          roughness: isZone ? 0.9 : 0.78,
          metalness: 0.02,
          transparent: isZone,
          opacity: isZone ? 0.28 : 1,
        })
        const mesh = new THREE.Mesh(geometry(new THREE.BoxGeometry(object.width || 5, object.height || 0.08, object.depth || 3.2)), floorMat)
        mesh.position.y = (object.height || 0.08) / 2
        addMesh(mesh, group, object.id)
      }

      function addMarker(object: PlantMapObject) {
        const group = createObjectGroup(object)
        const height = object.height || 2
        addMesh(new THREE.Mesh(geometry(new THREE.CylinderGeometry((object.width || 0.55) * 0.2, (object.width || 0.55) * 0.2, height, 20)), objectMaterial(object, 0xff5949, { roughness: 0.4, metalness: 0.1 })), group, object.id).position.y = height / 2
        addMesh(new THREE.Mesh(geometry(new THREE.BoxGeometry(object.width || 0.55, (object.width || 0.55) * 0.42, object.depth || 0.55)), objectMaterial(object, 0xff5949, { roughness: 0.4, metalness: 0.1 })), group, object.id).position.y = height + 0.22
      }

      function addModelObject(object: PlantMapObject) {
        const modelPath = getModelPath(object)
        if (!modelPath) return false
        const group = createObjectGroup(object)

        modelLoader.load(
          modelPath,
          (gltf) => {
            if (disposed) {
              disposeLoadedModel(gltf.scene)
              return
            }
            fitLoadedModel(gltf.scene, object)
            registerLoadedModel(gltf.scene, object.id)
            group.add(gltf.scene)
          },
          undefined,
          (error) => {
            console.warn(`No se pudo cargar el modelo 3D ${modelPath}:`, error)
            if (disposed) return
            const marker = new THREE.Mesh(
              geometry(new THREE.ConeGeometry(0.28, 0.62, 4)),
              objectMaterial(object, 0xff5949, { roughness: 0.42, metalness: 0.08 }),
            )
            marker.position.y = 0.34
            marker.rotation.y = Math.PI / 4
            addMesh(marker, group, object.id)
          },
        )
        return true
      }

      function addEditableObject(object: PlantMapObject) {
        if (addModelObject(object)) return
        if (object.objectType === 'belt' || object.objectType === 'belt_horizontal' || object.objectType === 'belt_inclined' || object.objectType === 'dispatch_belt') addBelt(object)
        else if (object.objectType === 'kiln') addKiln(object)
        else if (object.objectType === 'silo' || object.objectType === 'rectangular_silo') addSilo(object)
        else if (object.objectType === 'cabin') addCabin(object)
        else if (object.objectType === 'stockpile') addStockpile(object)
        else if (object.objectType === 'dispatch_bin') addDispatchBin(object)
        else if (object.objectType === 'truck_scale') addTruckScale(object)
        else if (object.objectType === 'rectangular_hopper') addHopper(object)
        else if (object.objectType === 'truck') addTruck(object)
        else if (object.objectType === 'yard') addYard(object)
        else if (object.objectType === 'floor' || object.objectType === 'zone') addFloor(object)
        else if (object.objectType === 'marker') addMarker(object)
        else addStructure(object)
      }

      const grid = new THREE.GridHelper(35, 35, 0xb9b2a8, 0xd9d3c9)
      grid.position.y = 0.025
      plant.add(grid)
      objects.forEach(addEditableObject)

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

      let lastScreenPositionsSignature = ''
      const projectedPosition = new THREE.Vector3()

      const reportObjectScreenPositions = () => {
        if (!onObjectScreenPositionsChangeRef.current) return
        const nextPositions: Record<string, { x: number; y: number }> = {}
        groupsRef.current.forEach((group, objectId) => {
          group.getWorldPosition(projectedPosition)
          projectedPosition.y += 1.3 * group.scale.y
          projectedPosition.project(camera)
          if (projectedPosition.z < -1 || projectedPosition.z > 1) return
          nextPositions[objectId] = {
            x: Math.round((projectedPosition.x * 0.5 + 0.5) * 1000) / 10,
            y: Math.round((-projectedPosition.y * 0.5 + 0.5) * 1000) / 10,
          }
        })
        const signature = Object.entries(nextPositions)
          .map(([objectId, position]) => `${objectId}:${position.x}:${position.y}`)
          .join('|')
        if (signature === lastScreenPositionsSignature) return
        lastScreenPositionsSignature = signature
        onObjectScreenPositionsChangeRef.current(nextPositions)
      }

      const render = () => {
        const elapsed = performance.now() / 1000
        keyLight.position.x = -8 + Math.sin(elapsed * 0.28) * 0.35
        controls?.update()
        if (cameraRef.current && controlsRef.current) onViewChangeRef.current?.(readCameraView(cameraRef.current, controlsRef.current))
        reportObjectScreenPositions()
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
        disposed = true
        renderer?.domElement.removeEventListener('pointerdown', handlePointerDown)
        renderer?.domElement.removeEventListener('pointermove', handlePointerMove)
        renderer?.domElement.removeEventListener('pointerup', finishDrag)
        renderer?.domElement.removeEventListener('pointercancel', finishDrag)
        if (frameId) window.cancelAnimationFrame(frameId)
        resizeObserver?.disconnect()
        controls?.dispose()
        cameraRef.current = null
        controlsRef.current = null
        if (renderer?.domElement.parentElement === mount) mount.removeChild(renderer.domElement)
        geometries.forEach((item) => item.dispose())
        materials.forEach((item) => item.dispose())
        renderer?.dispose()
        groupsRef.current.clear()
        pickTargetsRef.current = []
      }
    } catch (error) {
      console.error('No se pudo inicializar el modelo 3D de planta:', error)
      setFailed(true)
    }

    return () => {
      disposed = true
      if (frameId) window.cancelAnimationFrame(frameId)
      resizeObserver?.disconnect()
      controls?.dispose()
      cameraRef.current = null
      controlsRef.current = null
      if (renderer?.domElement.parentElement === mount) mount.removeChild(renderer.domElement)
      geometries.forEach((item) => item.dispose())
      materials.forEach((item) => item.dispose())
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
