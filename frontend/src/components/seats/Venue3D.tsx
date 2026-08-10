import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { VenuePlan, Seat as VenueSeat, StageMode } from '../../lib/venueLayout'
import { STAGE_BAND } from '../../lib/venueLayout'
import {
  buildChairGeometry,
  buildRiserGeometry,
  chairDims,
  createCrowdTexture,
  createScreenFallbackTexture,
  createWashTexture,
  defaultPos,
  defaultTarget,
  easeInOut,
  easeOutCubic,
  EYE_HEIGHT,
  seatYaw,
  stageCenter,
  stageLightPos,
  stageLookAt,
  worldFromNormalized,
  worldPos,
  WORLD_SCALE,
} from '../../lib/venueGeometry'
import { nextSeatInDirection, type SeatDirection } from '../../lib/seatNavigation'
import { tokens, venueTokens } from '../../lib/tokens'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'
import { IconButton } from '../ui/IconButton'
import { MinusIcon, PlusIcon, RecenterIcon, EyeIcon } from '../ui/icons'
import { SeatPreviewHUD } from './SeatPreviewHUD'
import type { MapTransform } from './SeatMap2D'
import type { Event } from '../../types'
import { sameOriginAsset } from '../../lib/assetUrl'
import { cn } from '../../lib/cn'

export type VenueEntry = 'default' | 'fromTop'

interface Venue3DProps {
  event: Event
  plan: VenuePlan
  selectedIds: string[]
  dimmedIds: Set<string>
  onToggleSeat: (seat: VenueSeat) => void
  /** How the camera should arrive; `fromTop` matches the 2D map's framing. */
  entry?: VenueEntry
  /** The 2D map's pan/zoom, used to line up the `fromTop` entry pose. */
  mapTransform?: MapTransform
  priceOf?: (ticketTypeId: number) => number
}

const DEFAULT_FOV = 42
const PREVIEW_FOV = 34
/** How far up the stage screen the seated eye naturally rests. */
const SCREEN_EYE_LIFT = 0.24
/** Radians of head turn per pixel dragged. */
const LOOK_SPEED = 0.0032
/** How far the head can turn away from the stage, and how far up or down. */
const MAX_YAW = 1.5
const MAX_PITCH = 0.62
/** Seconds to settle into the seat when the view opens, and to hop between seats. */
const ARRIVAL_SECONDS = 0.9
const HOP_SECONDS = 0.42

const ARROW_KEYS: Record<string, SeatDirection> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

function seatColor(seat: VenueSeat, isSelected: boolean, isDimmed: boolean): string {
  if (isDimmed) return venueTokens.seatDimmed
  if (isSelected) return tokens.accent
  if (seat.status === 'sold') return venueTokens.seatSold
  if (seat.isPremium) return venueTokens.seatPremium
  if (seat.isAccessible) return venueTokens.seatAccessible
  return venueTokens.seatAvailable
}

interface Flight {
  fromPos: THREE.Vector3
  toPos: THREE.Vector3
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  fromFov: number
  toFov: number
  t: number
  dur: number
  ease: (k: number) => number
}

/**
 * Camera pose that visually matches the 2D top-down map at its current zoom,
 * so switching views reads as one continuous move rather than a mode swap.
 */
function topDownPose(mode: StageMode, transform: MapTransform | undefined) {
  const target = defaultTarget(mode)
  const height = 3.6 / Math.max(1, transform?.scale ?? 1)
  // A perfectly vertical camera makes lookAt degenerate and sends the orbit
  // controls' polar angle to NaN, so nudge it off the axis.
  return {
    pos: new THREE.Vector3(target.x, height, target.z + 0.0001),
    target,
  }
}

function ControlsRef({
  controlsRef,
  mode,
  reduced,
  paused,
}: {
  controlsRef: React.MutableRefObject<OrbitControls | null>
  mode: StageMode
  reduced: boolean
  /** True while the first-person view owns the camera. */
  paused: boolean
}) {
  const { camera, gl } = useThree()

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement)
    controls.enableDamping = !reduced
    controls.dampingFactor = 0.08
    controls.minDistance = 0.4
    controls.maxDistance = 7
    controls.maxPolarAngle = Math.PI / 2 - 0.04
    controls.target.copy(defaultTarget(mode))
    controls.update()
    controlsRef.current = controls
    return () => {
      controls.dispose()
      controlsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl, mode, reduced])

  useEffect(() => {
    const controls = controlsRef.current
    if (controls) controls.enabled = !paused
  }, [controlsRef, paused])

  // update() clamps the camera-to-target distance whether or not the controls
  // are enabled, so it has to be skipped entirely while the first-person view
  // is driving — otherwise it drags the camera out of the seat every frame.
  useFrame(() => {
    if (paused) return
    controlsRef.current?.update()
  })

  return null
}

/**
 * A seated first-person camera: the position is pinned to the seat and dragging
 * turns the head, rather than orbiting the body around the stage.
 *
 * This owns the camera outright while active — orbit controls are paused and
 * the fly-to tween sits out — so nothing else can move the eye off the seat.
 */
function FirstPersonLook({
  eye,
  lookAt,
  active,
  reduced,
}: {
  eye: THREE.Vector3 | null
  lookAt: THREE.Vector3 | null
  active: boolean
  reduced: boolean
}) {
  const { camera, gl } = useThree()
  const yaw = useRef(0)
  const pitch = useRef(0)
  const baseYaw = useRef(0)
  const arrival = useRef(0)
  const from = useRef(new THREE.Vector3())
  const entered = useRef(false)
  /** True when the move is a seat change rather than the initial arrival. */
  const hop = useRef(false)
  const dragging = useRef(false)
  const last = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!active || !eye || !lookAt) return

    const dir = new THREE.Vector3().subVectors(lookAt, eye)
    const length = dir.length() || 1
    const nextBase = Math.atan2(-dir.x, -dir.z)

    if (entered.current) {
      // Moving between seats: carry the viewer's head position with them and
      // recentre the turn limits on the new bearing, rather than snapping their
      // gaze back to the stage every time they shift a seat.
      yaw.current += nextBase - baseYaw.current
    } else {
      yaw.current = nextBase
      pitch.current = Math.asin(THREE.MathUtils.clamp(dir.y / length, -1, 1))
      entered.current = true
    }

    baseYaw.current = nextBase
    from.current.copy(camera.position)
    hop.current = entered.current
    arrival.current = reduced ? 1 : 0
  }, [active, eye, lookAt, camera, reduced])

  // Reset once the view closes so the next opening orients from scratch.
  useEffect(() => {
    if (!active) entered.current = false
  }, [active])

  useEffect(() => {
    if (!active) return
    const element = gl.domElement

    const down = (e: PointerEvent) => {
      dragging.current = true
      last.current = { x: e.clientX, y: e.clientY }
      element.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - last.current.x
      const dy = e.clientY - last.current.y
      last.current = { x: e.clientX, y: e.clientY }
      yaw.current = THREE.MathUtils.clamp(
        yaw.current - dx * LOOK_SPEED,
        baseYaw.current - MAX_YAW,
        baseYaw.current + MAX_YAW,
      )
      pitch.current = THREE.MathUtils.clamp(pitch.current - dy * LOOK_SPEED, -MAX_PITCH, MAX_PITCH)
    }
    const up = (e: PointerEvent) => {
      dragging.current = false
      if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId)
    }

    element.addEventListener('pointerdown', down)
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', up)
    element.style.cursor = 'grab'

    return () => {
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', up)
      element.style.cursor = ''
      dragging.current = false
    }
  }, [active, gl])

  useFrame((_, delta) => {
    if (!active || !eye) return

    // Glide into the seat, then hold it exactly. Hopping to a neighbouring seat
    // is quicker than the initial arrival so moving around stays responsive.
    if (arrival.current < 1) {
      const duration = hop.current ? HOP_SECONDS : ARRIVAL_SECONDS
      arrival.current = Math.min(1, arrival.current + Math.min(delta, 1 / 30) / duration)
      camera.position.lerpVectors(from.current, eye, easeOutCubic(arrival.current))
    } else {
      camera.position.copy(eye)
    }

    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ')
    if (camera instanceof THREE.PerspectiveCamera && camera.fov !== PREVIEW_FOV) {
      camera.fov += (PREVIEW_FOV - camera.fov) * 0.12
      camera.updateProjectionMatrix()
    }
  })

  return null
}

function FlyTo({
  controlsRef,
  mode,
  previewSeat,
  entry,
  mapTransform,
  reduced,
}: {
  controlsRef: React.MutableRefObject<OrbitControls | null>
  mode: StageMode
  previewSeat: VenueSeat | null
  entry: VenueEntry
  mapTransform: MapTransform | undefined
  reduced: boolean
}) {
  const camera = useThree((s) => s.camera)
  const flight = useRef<Flight | null>(null)
  const mounted = useRef(false)

  const begin = useCallback(
    (
      toPos: THREE.Vector3,
      toTarget: THREE.Vector3,
      toFov: number,
      dur: number,
      ease: (k: number) => number,
      fromPos?: THREE.Vector3,
    ) => {
      const controls = controlsRef.current
      if (!controls) return
      flight.current = {
        fromPos: fromPos ?? camera.position.clone(),
        toPos,
        fromTarget: controls.target.clone(),
        toTarget,
        fromFov: camera instanceof THREE.PerspectiveCamera ? camera.fov : DEFAULT_FOV,
        toFov,
        t: 0,
        dur: reduced ? 0 : dur,
        ease,
      }
    },
    [camera, controlsRef, reduced],
  )

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return

    if (!mounted.current) {
      mounted.current = true
      const from = entry === 'fromTop' ? topDownPose(mode, mapTransform) : null
      if (from) {
        camera.position.copy(from.pos)
        controls.target.copy(from.target)
      }
      begin(defaultPos(mode), defaultTarget(mode), DEFAULT_FOV, 0.95, easeOutCubic, from?.pos)
      return
    }

    // The first-person view owns the camera outright while it is open; this
    // tween only handles arriving at the venue and returning from a seat.
    if (previewSeat) {
      flight.current = null
      return
    }

    controls.target.copy(defaultTarget(mode))
    begin(defaultPos(mode), defaultTarget(mode), DEFAULT_FOV, 0.9, easeInOut)
  }, [begin, camera, controlsRef, entry, mapTransform, mode, previewSeat])

  useFrame((_, delta) => {
    const controls = controlsRef.current
    const f = flight.current
    if (!controls || !f) return

    // Clamp so a backgrounded tab does not teleport the camera on resume.
    f.t += Math.min(delta, 1 / 30)
    const k = f.dur <= 0 ? 1 : f.ease(Math.min(1, f.t / f.dur))

    camera.position.lerpVectors(f.fromPos, f.toPos, k)
    controls.target.lerpVectors(f.fromTarget, f.toTarget, k)
    if (camera instanceof THREE.PerspectiveCamera && f.fromFov !== f.toFov) {
      camera.fov = f.fromFov + (f.toFov - f.fromFov) * k
      camera.updateProjectionMatrix()
    }
    controls.enabled = k >= 1
    controls.update()
    if (k >= 1) flight.current = null
  })

  return null
}

function SeatInstances({
  plan,
  selectedIds,
  dimmedIds,
  mode,
  focusedSeat,
  picking,
  onToggleSeat,
  onShadowsDirty,
}: {
  plan: VenuePlan
  selectedIds: string[]
  dimmedIds: Set<string>
  mode: StageMode
  focusedSeat: VenueSeat | null
  /** False while the first-person view is open. */
  picking: boolean
  onToggleSeat: (seat: VenueSeat) => void
  onShadowsDirty: () => void
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const selectAttr = useRef<THREE.InstancedBufferAttribute | null>(null)
  const scratch = useRef(new THREE.Color())
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const count = Math.max(1, plan.seats.length)

  const geometry = useMemo(
    () => buildChairGeometry(plan.metrics),
    // Memoize on the scalar pitch values: `plan.metrics` is a fresh object on
    // every build, which would otherwise rebuild the geometry needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan.metrics.colPitch, plan.metrics.rowPitch],
  )
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.04 })
    // A lit material multiplies albedo by incoming light, so a selected chair
    // sitting in shadow would render far darker than the brand crimson. Push
    // the instance colour through emissive for selected seats only, which keeps
    // the exact token colour without a bloom pass and without a second mesh.
    m.onBeforeCompile = (shader) => {
      const vertexBefore = shader.vertexShader
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float aSelected;\nvarying float vSelected;',
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSelected = aSelected;')
      const fragmentBefore = shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSelected;')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor * vSelected * 0.85;',
        )
      if (import.meta.env.DEV) {
        if (vertexBefore === shader.vertexShader || fragmentBefore === shader.fragmentShader) {
          console.warn('[Venue3D] selected-seat emissive patch did not apply; check three version')
        }
      }
    }
    return m
  }, [])
  useEffect(() => () => material.dispose(), [material])

  // Matrices depend only on the layout, so this runs once per plan rather than
  // on every selection change.
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()

    plan.seats.forEach((seat, i) => {
      dummy.position.copy(worldPos(seat, mode))
      dummy.rotation.set(0, seatYaw(seat, mode), 0)
      dummy.scale.setScalar(dimmedIds.has(seat.id) ? 0.55 : 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    // Without this the bounding sphere goes stale and every pointermove
    // raycasts the full 36k-triangle mesh instead of rejecting early.
    mesh.computeBoundingSphere()
    onShadowsDirty()
  }, [plan, mode, dimmedIds, onShadowsDirty])

  // Colours and the selected flag are cheap and allocation-free.
  //
  // Seats between the eye and the stage are deliberately left standing during
  // the first-person view: looking over the backs of the rows in front is what
  // makes the shot read as a real seat rather than a floating camera.
  useLayoutEffect(() => {
    const mesh = ref.current
    const flags = selectAttr.current
    if (!mesh || !flags) return

    plan.seats.forEach((seat, i) => {
      const isSelected = selectedSet.has(seat.id)
      scratch.current.set(seatColor(seat, isSelected, dimmedIds.has(seat.id)))
      mesh.setColorAt(i, scratch.current)
      flags.setX(i, isSelected ? 1 : 0)
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    flags.needsUpdate = true
  }, [plan, selectedSet, dimmedIds])

  const selectArray = useMemo(() => new Float32Array(count), [count])

  const handlePick = (e: ThreeEvent<PointerEvent>) => {
    // Suppressed in first person, where a pointer drag is a head turn and would
    // otherwise toggle whichever seat happened to be under the cursor.
    if (!picking) return
    const id = e.instanceId
    if (id == null) return
    const seat = plan.seats[id]
    if (!seat || seat.status === 'sold' || dimmedIds.has(seat.id)) return
    onToggleSeat(seat)
  }

  return (
    <>
      <instancedMesh
        ref={ref}
        args={[geometry, material, count]}
        castShadow
        receiveShadow
        onPointerDown={handlePick}
      >
        <instancedBufferAttribute
          ref={selectAttr}
          attach="geometry-attributes-aSelected"
          args={[selectArray, 1]}
        />
      </instancedMesh>
      {focusedSeat && <FocusRing seat={focusedSeat} mode={mode} plan={plan} />}
    </>
  )
}

/**
 * Static crowd figures on the seats that are already taken.
 *
 * These are set dressing, not entities: one instanced quad per occupied seat,
 * fixed facing the stage, with colour and scale jittered from a hash of the
 * seat id so the bank of people does not read as a repeated stamp. The whole
 * crowd is a single draw call and never updates after the plan is built.
 */
function CrowdInstances({ plan, mode }: { plan: VenuePlan; mode: StageMode }) {
  const ref = useRef<THREE.InstancedMesh>(null)

  const occupied = useMemo(() => plan.seats.filter((s) => s.status === 'sold'), [plan.seats])
  const count = Math.max(1, occupied.length)

  const texture = useMemo(() => createCrowdTexture(), [])
  useEffect(() => () => texture.dispose(), [texture])

  const dims = useMemo(() => chairDims(plan.metrics), [plan.metrics])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return

    const dummy = new THREE.Object3D()
    const colour = new THREE.Color()

    occupied.forEach((seat, i) => {
      const p = worldPos(seat, mode)
      // A cheap deterministic hash keeps the jitter stable across renders.
      const hash = (seat.rowGlobal * 73856093) ^ (seat.colIndex * 19349663)
      const jitter = ((hash >>> 0) % 1000) / 1000
      const scale = 0.88 + jitter * 0.24

      dummy.position.set(p.x, p.y + dims.padH + dims.backH * 0.95 * scale, p.z)
      dummy.rotation.set(0, seatYaw(seat, mode), 0)
      dummy.scale.set(dims.w * 1.15 * scale, dims.backH * 2.1 * scale, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      const shade = 0.16 + jitter * 0.2
      colour.setRGB(shade, shade * 0.94, shade * 0.9)
      mesh.setColorAt(i, colour)
    })

    mesh.count = occupied.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [occupied, mode, dims])

  if (occupied.length === 0) return null

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        transparent
        alphaTest={0.45}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </instancedMesh>
  )
}

/** A single animated outline that marks the keyboard-focused seat. */
function FocusRing({ seat, mode, plan }: { seat: VenueSeat; mode: StageMode; plan: VenuePlan }) {
  const ref = useRef<THREE.Mesh>(null)
  const t = useRef(0)
  const dims = useMemo(() => chairDims(plan.metrics), [plan.metrics])
  const position = useMemo(() => {
    const p = worldPos(seat, mode)
    return new THREE.Vector3(p.x, p.y + 0.002, p.z)
  }, [seat, mode])

  useFrame((_, delta) => {
    const mesh = ref.current
    if (!mesh) return
    t.current += delta
    mesh.scale.setScalar(1 + Math.sin(t.current * 4) * 0.09)
  })

  return (
    <mesh ref={ref} position={position} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[dims.w * 0.85, dims.w * 1.05, 24]} />
      <meshBasicMaterial color={tokens.accent} transparent opacity={0.85} depthWrite={false} />
    </mesh>
  )
}

function Risers({ plan, mode }: { plan: VenuePlan; mode: StageMode }) {
  const geometry = useMemo(
    () => buildRiserGeometry(plan.rows, plan.sectionBounds, plan.metrics, mode),
    [plan.rows, plan.sectionBounds, plan.metrics, mode],
  )
  useEffect(() => () => geometry?.dispose(), [geometry])

  if (!geometry) return null
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={venueTokens.riser} roughness={0.94} metalness={0} />
    </mesh>
  )
}

/**
 * The stage wash — the only glow in the product. A soft additive pool on the
 * floor plus a back-faced cone standing in for a volumetric shaft; both are
 * cheaper and better behaved than a bloom pass, which would bleed onto the
 * selected seats and break the "accent is scarce" rule.
 */
function StageWash({ mode }: { mode: StageMode }) {
  const texture = useMemo(() => createWashTexture(), [])
  useEffect(() => () => texture.dispose(), [texture])

  const center = useMemo(() => stageCenter(mode), [mode])
  const light = useMemo(() => stageLightPos(mode), [mode])
  const band = STAGE_BAND[mode]
  const width = (band.maxX - band.minX) * WORLD_SCALE * 2.1

  return (
    <group>
      <mesh position={[center.x, 0.012, center.z]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[width, width * 0.75]} />
        <meshBasicMaterial
          map={texture}
          color={venueTokens.wash}
          transparent
          opacity={0.3}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh position={[light.x, light.y / 2, light.z]} renderOrder={2}>
        <coneGeometry args={[width * 0.32, light.y, 28, 1, true]} />
        <meshBasicMaterial
          color={venueTokens.wash}
          transparent
          opacity={0.055}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}

/**
 * The stage's LED wall, plus the two flanking screens a real arena rig has.
 *
 * The event's own cover photo is what plays on it, which gives the first-person
 * seat view something real to look at and makes distance and angle legible at a
 * glance — a back-row seat sees a small screen, a side seat sees it skewed.
 */
function StageScreens({ mode, coverUrl }: { mode: StageMode; coverUrl: string | null }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const band = STAGE_BAND[mode]
  const center = useMemo(() => stageCenter(mode), [mode])

  // A lit stand-in so the wall is never a black rectangle — it shows while the
  // photo downloads, and stays if the event has no cover or the load fails.
  const fallback = useMemo(() => createScreenFallbackTexture(), [])
  useEffect(() => () => fallback.dispose(), [fallback])

  useEffect(() => {
    if (!coverUrl) {
      setTexture(null)
      return
    }
    let cancelled = false
    let loaded: THREE.Texture | null = null

    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(
      coverUrl,
      (result) => {
        if (cancelled) {
          result.dispose()
          return
        }
        result.colorSpace = THREE.SRGBColorSpace
        loaded = result
        setTexture(result)
      },
      undefined,
      () => {
        /* A missing cover just leaves the screen dark. */
      },
    )

    return () => {
      cancelled = true
      loaded?.dispose()
    }
  }, [coverUrl])

  const a = worldFromNormalized(band.minX, band.minY, 0, mode)
  const b = worldFromNormalized(band.maxX, band.maxY, 0, mode)
  const stageWidth = Math.max(Math.abs(b.x - a.x), 0.4)

  const mainW = stageWidth * 0.82
  const mainH = mainW * 0.52
  const sideW = mainW * 0.42
  const sideH = sideW * 0.56
  const z = mode === 'arena' ? center.z : center.z - 0.02

  const screenMaterial = (dim = 1) => (
    <meshBasicMaterial
      map={texture ?? fallback}
      toneMapped={false}
      color={new THREE.Color(dim, dim, dim)}
    />
  )

  return (
    <group>
      {/* Main wall, standing on the stage deck. */}
      <mesh position={[center.x, 0.1 + mainH / 2, z]}>
        <planeGeometry args={[mainW, mainH]} />
        {screenMaterial()}
      </mesh>
      {/* Thin bezel so the wall reads as a panel rather than a floating image. */}
      <mesh position={[center.x, 0.1 + mainH / 2, z - 0.006]}>
        <planeGeometry args={[mainW * 1.03, mainH * 1.05]} />
        <meshBasicMaterial color="#000000" toneMapped={false} />
      </mesh>

      {/* Flanking screens, angled in toward the house. */}
      {mode !== 'arena' &&
        ([-1, 1] as const).map((side) => (
          <group
            key={side}
            position={[center.x + side * (mainW / 2 + sideW * 0.62), 0.26 + sideH / 2, z + 0.16]}
            rotation-y={side * -0.42}
          >
            <mesh>
              <planeGeometry args={[sideW, sideH]} />
              {screenMaterial(0.85)}
            </mesh>
            <mesh position={[0, 0, -0.005]}>
              <planeGeometry args={[sideW * 1.05, sideH * 1.08]} />
              <meshBasicMaterial color="#000000" toneMapped={false} />
            </mesh>
          </group>
        ))}
    </group>
  )
}

/**
 * Overhead rig: a dark ceiling plane and a few additive beams angled at the
 * stage, which is what gives the first-person view its sense of enclosure.
 */
function Rig({ mode }: { mode: StageMode }) {
  const center = useMemo(() => stageCenter(mode), [mode])
  const beams = useMemo(() => [-0.42, -0.16, 0.16, 0.42], [])

  return (
    <group>
      <mesh rotation-x={Math.PI / 2} position={[0, 1.35, 0]}>
        <planeGeometry args={[6, 6]} />
        <meshBasicMaterial color="#0a0a0a" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>

      {beams.map((offset, i) => (
        <mesh
          key={i}
          position={[center.x + offset, 0.86, center.z + 0.28]}
          rotation-x={0.34}
          rotation-z={offset * 0.5}
          renderOrder={3}
        >
          <coneGeometry args={[0.11, 1.1, 20, 1, true]} />
          <meshBasicMaterial
            color={venueTokens.wash}
            transparent
            opacity={0.05}
            side={THREE.BackSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

function StageMesh({ mode }: { mode: StageMode }) {
  const band = STAGE_BAND[mode]
  const center = useMemo(() => stageCenter(mode), [mode])

  if (mode === 'arena') {
    return (
      <mesh position={[center.x, 0.03, center.z]} castShadow receiveShadow>
        <cylinderGeometry args={[0.18, 0.22, 0.06, 32]} />
        <meshStandardMaterial color={venueTokens.stageBody} roughness={0.6} />
      </mesh>
    )
  }

  const a = worldFromNormalized(band.minX, band.minY, 0, mode)
  const b = worldFromNormalized(band.maxX, band.maxY, 0, mode)
  const width = Math.abs(b.x - a.x)
  const depth = Math.abs(b.z - a.z)

  return (
    <group>
      <mesh position={[center.x, 0.05, center.z]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.1, depth]} />
        <meshStandardMaterial color={venueTokens.stageBody} roughness={0.6} />
      </mesh>
      <mesh position={[center.x, 0.012, center.z + depth * 0.62]} receiveShadow>
        <boxGeometry args={[width * 1.08, 0.024, depth * 0.3]} />
        <meshStandardMaterial color={venueTokens.stageBottom} roughness={0.9} />
      </mesh>
    </group>
  )
}

function Ground() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
      <planeGeometry args={[12, 12]} />
      <meshStandardMaterial color={tokens.ink} roughness={0.96} />
    </mesh>
  )
}

/**
 * Shadows are static — nothing in the scene moves, only the camera — so the
 * shadow map is rendered on demand rather than every frame.
 */
function ShadowController({ dirty }: { dirty: number }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
  }, [gl, dirty])
  return null
}

export function Venue3D({
  event,
  plan,
  selectedIds,
  dimmedIds,
  onToggleSeat,
  entry = 'default',
  mapTransform,
  priceOf,
}: Venue3DProps) {
  const controlsRef = useRef<OrbitControls | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const reduced = usePrefersReducedMotion()
  const mode = plan.stageMode

  const [previewSeat, setPreviewSeat] = useState<VenueSeat | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [shadowTick, setShadowTick] = useState(0)

  const markShadowsDirty = useCallback(() => setShadowTick((n) => n + 1), [])

  const chair = useMemo(
    () => chairDims(plan.metrics),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan.metrics.colPitch, plan.metrics.rowPitch],
  )

  // Same-origin so the texture never taints the WebGL canvas.
  const coverUrl = useMemo(() => sameOriginAsset(event.cover_image_url), [event.cover_image_url])

  // Where the eye sits and what it faces, in world space.
  const seatEye = useMemo(() => {
    if (!previewSeat) return null
    const p = worldPos(previewSeat, mode)
    return new THREE.Vector3(p.x, p.y + chair.padH + EYE_HEIGHT, p.z)
  }, [previewSeat, mode, chair])

  const screenFocus = useMemo(() => {
    const screen = stageLookAt(mode)
    return new THREE.Vector3(screen.x, screen.y + SCREEN_EYE_LIFT, screen.z)
  }, [mode])

  const skip = useCallback(
    (seat: VenueSeat) => seat.status === 'sold' || dimmedIds.has(seat.id),
    [dimmedIds],
  )

  // The most recently picked seat, so "View from …" follows the seat you just
  // clicked rather than whichever happens to come first in the layout.
  const selectedSeat = useMemo(() => {
    const lastId = selectedIds[selectedIds.length - 1]
    return plan.seats.find((s) => s.id === lastId) ?? null
  }, [plan.seats, selectedIds])
  const focusedSeat = useMemo(
    () => plan.seats.find((s) => s.id === focusedId) ?? null,
    [plan.seats, focusedId],
  )

  // Where the seated view opens: the seat you picked if there is one, otherwise
  // the best free seat in the house, so the view is reachable without
  // committing to a booking first.
  const entrySeat = useMemo(() => {
    if (selectedSeat) return selectedSeat
    let best: VenueSeat | null = null
    let bestScore = Infinity
    for (const seat of plan.seats) {
      if (seat.status === 'sold') continue
      const score = Math.abs(seat.x - 0.5) * 2 + seat.rowInTier * 0.02
      if (score < bestScore) {
        bestScore = score
        best = seat
      }
    }
    return best
  }, [plan.seats, selectedSeat])

  const previewSection = useMemo(() => {
    if (!previewSeat) return null
    return plan.sections.find((s) => s.ticketType.id === previewSeat.ticketTypeId) ?? null
  }, [plan.sections, previewSeat])

  useEffect(() => {
    if (!previewSeat) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewSeat(null)
        containerRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewSeat])

  /** Move the seated viewpoint to the neighbouring seat in a direction. */
  const moveSeat = useCallback(
    (direction: SeatDirection) => {
      setPreviewSeat((current) => {
        if (!current) return current
        // Sold seats are occupied by the crowd, so they are not somewhere you
        // can sit; filtered-out seats stay available to move through.
        const next = nextSeatInDirection(
          plan.seats,
          current.id,
          direction,
          (seat) => seat.status === 'sold',
        )
        return next ?? current
      })
    },
    [plan.seats],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const direction = ARROW_KEYS[e.key]

    // Seated: arrows walk you between seats while the venue stays put.
    if (previewSeat) {
      if (direction) {
        e.preventDefault()
        moveSeat(direction)
      }
      return
    }

    if (direction) {
      e.preventDefault()
      const from = focusedId ?? plan.seats.find((s) => !skip(s))?.id
      if (!from) return
      const next = focusedId ? nextSeatInDirection(plan.seats, from, direction, skip) : { id: from }
      if (next) setFocusedId(next.id)
      return
    }
    if ((e.key === 'Enter' || e.key === ' ') && focusedSeat) {
      e.preventDefault()
      onToggleSeat(focusedSeat)
    }
  }

  // Keep focus on the canvas while seated so the arrow keys reach it.
  useEffect(() => {
    if (previewSeat) containerRef.current?.focus()
  }, [previewSeat])

  const zoom = (factor: number) => {
    const controls = controlsRef.current
    if (!controls) return
    if (factor > 1) controls.dollyIn(factor)
    else controls.dollyOut(1 / factor)
    controls.update()
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-line bg-ink">
      <div
        ref={containerRef}
        tabIndex={0}
        role="application"
        aria-label={`3D venue, ${plan.totalAvailable} seats available. Use the arrow keys to move between seats and Enter to select.`}
        onKeyDown={handleKeyDown}
        className="h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
      >
        <Canvas
          // `flat` disables the ACES tone mapping react-three-fiber applies by
          // default, which would desaturate the crimson on selected seats.
          flat
          shadows="soft"
          // A short near plane matters in first person: at high seat counts the
          // row in front is only ~0.02 world units away and would clip out.
          camera={{ position: defaultPos(mode), fov: DEFAULT_FOV, near: 0.004, far: 40 }}
          dpr={[1, 1.75]}
          performance={{ min: 0.5 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <color attach="background" args={[tokens.ink]} />

          <hemisphereLight color="#3d4552" groundColor="#101010" intensity={0.62} />
          <ambientLight intensity={0.32} />
          <directionalLight position={[2.5, 5, 2]} intensity={0.4} color="#c8d4e0" />
          <StageKeyLight mode={mode} />

          <Ground />
          <Risers plan={plan} mode={mode} />
          <StageMesh mode={mode} />
          <StageScreens mode={mode} coverUrl={coverUrl} />
          <StageWash mode={mode} />
          <Rig mode={mode} />
          <SeatInstances
            plan={plan}
            selectedIds={selectedIds}
            dimmedIds={dimmedIds}
            mode={mode}
            focusedSeat={focusedSeat}
            picking={previewSeat === null}
            onToggleSeat={onToggleSeat}
            onShadowsDirty={markShadowsDirty}
          />
          <CrowdInstances plan={plan} mode={mode} />

          <ControlsRef
            controlsRef={controlsRef}
            mode={mode}
            reduced={reduced}
            paused={previewSeat !== null}
          />
          <FlyTo
            controlsRef={controlsRef}
            mode={mode}
            previewSeat={previewSeat}
            entry={entry}
            mapTransform={mapTransform}
            reduced={reduced}
          />
          <FirstPersonLook
            eye={seatEye}
            lookAt={screenFocus}
            active={previewSeat !== null}
            reduced={reduced}
          />
          <ShadowController dirty={shadowTick} />
        </Canvas>
      </div>

      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
        <span className="rounded-full border border-line bg-black/40 px-3 py-1 text-xs font-medium text-muted backdrop-blur-sm">
          3D
        </span>
        {!previewSeat && entrySeat && (
          <button
            type="button"
            onClick={() => setPreviewSeat(entrySeat)}
            className={cn(
              'pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1',
              'text-xs font-medium text-white transition-colors hover:bg-accent-soft',
            )}
          >
            <EyeIcon className="size-3.5" />
            {selectedSeat ? `View from ${selectedSeat.label}` : 'Take a seat'}
          </button>
        )}
      </div>

      <span aria-live="polite" className="sr-only">
        {focusedSeat ? `Seat ${focusedSeat.label} focused` : ''}
      </span>

      {previewSeat && (
        <SeatPreviewHUD
          seat={previewSeat}
          mode={mode}
          sectionName={previewSection?.ticketType.name ?? ''}
          price={
            priceOf?.(previewSeat.ticketTypeId) ?? Number(previewSection?.ticketType.price ?? 0)
          }
          isSelected={selectedIds.includes(previewSeat.id)}
          onToggle={onToggleSeat}
          onMove={moveSeat}
          onExit={() => setPreviewSeat(null)}
        />
      )}

      <div className="absolute bottom-4 right-4 flex gap-2">
        <IconButton aria-label="Zoom in" onClick={() => zoom(1.18)}>
          <PlusIcon />
        </IconButton>
        <IconButton aria-label="Zoom out" onClick={() => zoom(1 / 1.18)}>
          <MinusIcon />
        </IconButton>
        <IconButton
          aria-label="Recenter view"
          onClick={() => {
            setPreviewSeat(null)
            controlsRef.current?.target.copy(defaultTarget(mode))
            controlsRef.current?.update()
          }}
        >
          <RecenterIcon />
        </IconButton>
      </div>
    </div>
  )
}

function StageKeyLight({ mode }: { mode: StageMode }) {
  const ref = useRef<THREE.SpotLight>(null)
  const target = useMemo(() => {
    const object = new THREE.Object3D()
    object.position.copy(stageLookAt(mode))
    return object
  }, [mode])
  const position = useMemo(() => stageLightPos(mode), [mode])

  useEffect(() => {
    if (ref.current) ref.current.target = target
  }, [target])

  return (
    <>
      <primitive object={target} />
      <spotLight
        ref={ref}
        position={position}
        color={venueTokens.wash}
        intensity={9}
        distance={7}
        decay={2}
        angle={0.62}
        penumbra={0.95}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0008}
        shadow-camera-near={0.4}
        shadow-camera-far={7}
      />
    </>
  )
}
