import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import { MeshPhongMaterial } from 'three'
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import countries from 'world-atlas/countries-110m.json'
import { gradientFor, initialOf } from '../../lib/avatar'
import { localTime } from '../../lib/time'
import type { Person } from '../group/context'

type Props = {
  people: Person[]
  meId: string
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Where the sheet covers the globe, so the focused person stays visible. */
  sheet: 'left' | 'bottom'
}

type Pin = { id: string; lat: number; lng: number; person: Person }
type Feature = { id?: string; properties?: { name?: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } }

// Stylized "clay" globe, matching the Long-Distance Weekly prototype.
const LAND = ['#9ee07c', '#bfe866', '#ffd96a', '#7fdcae', '#d4ee5e', '#b2e38a']
const landColor = (f: object) => {
  const feat = f as Feature
  if (feat.properties?.name === 'Antarctica') return '#ffffff'
  let h = 0
  for (const ch of String(feat.id ?? feat.properties?.name ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return LAND[h % LAND.length]
}
const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

function useLand() {
  return useMemo(() => {
    const topo = countries as unknown as Topology
    const all = (feature(topo, topo.objects.countries) as unknown as { features: Feature[] }).features
    // Drop zero-area slivers (one North Korea part is a single repeated point).
    const real = (poly: number[][][]) => new Set(poly[0].map((p) => p.join())).size >= 3
    return all
      .map((f) =>
        f.geometry.type === 'MultiPolygon'
          ? { ...f, geometry: { ...f.geometry, coordinates: (f.geometry.coordinates as number[][][][]).filter(real) } }
          : f,
      )
      .filter((f) => f.geometry.type !== 'Polygon' || real(f.geometry.coordinates as number[][][]))
  }, [])
}

export default function GlobeView({ people, meId, selectedId, onSelect, sheet }: Props) {
  const ref = useRef<GlobeMethods | undefined>(undefined)
  const box = useRef<HTMLDivElement>(null)
  const pinEls = useRef(new Map<string, HTMLButtonElement>())
  const [size, setSize] = useState({ w: 0, h: 0 })
  const land = useLand()
  const material = useMemo(
    () => new MeshPhongMaterial({ color: '#6ec3ff', emissive: '#3fa2ff', emissiveIntensity: 0.28, shininess: 6 }),
    [],
  )
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // Measure once right away (some embedded browsers never deliver the first ResizeObserver
  // callback), then follow container and window resizes.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      removeEventListener('resize', measure)
    }
  }, [])

  const pins = useMemo<Pin[]>(
    () => people.filter((p) => p.lat !== null && p.lng !== null).map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng!, person: p })),
    [people],
  )

  const makePin = useCallback(
    (d: object) => {
      const { person } = d as Pin
      const [from, to] = gradientFor(person.id)
      const b = document.createElement('button')
      b.type = 'button'
      b.tabIndex = -1 // keyboard users use the People list
      b.className = 'globe-pin' + (person.notes ? '' : ' pending')
      b.setAttribute('aria-label', `Open ${person.name}'s page`)
      b.innerHTML = '<span class="inner"><span class="av"></span><span class="nub"></span><span class="name"></span></span>'
      const av = b.querySelector('.av') as HTMLElement
      av.textContent = person.id === meId ? 'Me' : initialOf(person.name)
      av.style.background = `linear-gradient(160deg, ${from}, ${to})`
      ;(b.querySelector('.name') as HTMLElement).textContent = person.id === meId ? 'You' : person.name
      b.title = `${person.name}, ${person.city ?? ''} ${localTime(person.tz)}`.trim()
      b.onclick = (e) => {
        e.stopPropagation()
        onSelectRef.current(person.id)
      }
      pinEls.current.set(person.id, b)
      return b
    },
    [meId],
  )

  const me = people.find((p) => p.id === meId)
  const target = people.find((p) => p.id === selectedId)
  const arcs = useMemo(
    () =>
      me && target && target.id !== me.id && me.lat !== null && target.lat !== null
        ? [{ startLat: me.lat, startLng: me.lng, endLat: target.lat, endLng: target.lng }]
        : [],
    [me, target],
  )

  // Fly to the selected person (offset so the sheet doesn't cover them); spin gently otherwise.
  useEffect(() => {
    pinEls.current.forEach((el, id) => el.classList.toggle('sel', id === selectedId))
    const g = ref.current
    if (!g) return
    const controls = g.controls() as unknown as { autoRotate: boolean }
    controls.autoRotate = !selectedId && !reduceMotion
    if (target && target.lat !== null && target.lng !== null) {
      const pov =
        sheet === 'bottom'
          ? { lat: target.lat - 14, lng: target.lng, altitude: 2 }
          : { lat: target.lat, lng: target.lng - 24, altitude: 1.5 }
      g.pointOfView(pov, reduceMotion ? 0 : 1100)
    }
  }, [selectedId, target, sheet])

  function ready() {
    const g = ref.current
    if (!g) return
    const [amb, sun] = g.lights() as unknown as [{ intensity: number }, { intensity: number; position: { set: (x: number, y: number, z: number) => void } }]
    amb.intensity = 2.7
    sun.intensity = 1.5
    sun.position.set(-1.2, 1.4, 1.6)
    const controls = g.controls() as unknown as { autoRotate: boolean; autoRotateSpeed: number; minDistance: number; addEventListener: (e: string, f: () => void) => void }
    controls.autoRotate = !selectedId && !reduceMotion
    controls.autoRotateSpeed = 0.3
    controls.minDistance = 130
    controls.addEventListener('start', () => {
      controls.autoRotate = false
    })
    const start = me?.lat != null ? me : pins[0]?.person
    g.pointOfView(
      start && start.lat !== null && start.lng !== null
        ? sheet === 'bottom'
          ? { lat: start.lat - 12, lng: start.lng + 20, altitude: 2.6 }
          : { lat: start.lat - 8, lng: start.lng - 10, altitude: 2.2 }
        : { lat: 25, lng: -40, altitude: 2.4 },
    )
  }

  return (
    <div ref={box} className="absolute inset-0" role="img" aria-label="Globe showing where each member is. Use the People list to open someone's page.">
      {size.w > 0 && (
        <Globe
          ref={ref}
          width={size.w}
          height={size.h}
          animateIn={!reduceMotion}
          backgroundColor="rgba(0,0,0,0)"
          globeMaterial={material}
          showAtmosphere
          atmosphereColor="#bfe3ff"
          atmosphereAltitude={0.18}
          polygonsData={land}
          polygonCapColor={landColor}
          polygonSideColor={() => 'rgba(76,150,84,0.6)'}
          polygonStrokeColor={() => 'rgba(255,255,255,0.95)'}
          polygonAltitude={0.011}
          polygonsTransitionDuration={0}
          arcsData={arcs}
          arcColor={() => ['#f5b400', '#f08c00']}
          arcStroke={0.7}
          arcAltitudeAutoScale={0.35}
          arcDashLength={0.45}
          arcDashGap={0.14}
          arcDashAnimateTime={reduceMotion ? 0 : 2200}
          htmlElementsData={pins}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={0.02}
          htmlElement={makePin}
          htmlElementVisibilityModifier={(el, visible) => {
            el.style.opacity = visible ? '1' : '0'
            el.style.pointerEvents = visible ? 'auto' : 'none'
          }}
          onGlobeClick={() => onSelectRef.current(null)}
          onGlobeReady={ready}
        />
      )}
    </div>
  )
}
