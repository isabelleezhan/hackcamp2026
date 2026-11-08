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
  sheet: 'left' | 'bottom' | 'none'
}

type Pin = { id: string; lat: number; lng: number; members: Person[] }

const NEAR_KM = 250
const MAX_AVATARS = 4

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = Math.PI / 180
  const h =
    Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/** Put people who are close together (same city, or neighbouring ones) on one pin. */
function clusterPeople(people: Person[]): Pin[] {
  const pins: Pin[] = []
  for (const p of people) {
    if (p.lat === null || p.lng === null) continue
    const near = pins.find((c) => km(c.lat, c.lng, p.lat!, p.lng!) < NEAR_KM)
    if (near) {
      near.members.push(p)
      const n = near.members.length
      near.lat += (p.lat - near.lat) / n
      near.lng += (p.lng - near.lng) / n
    } else pins.push({ id: p.id, lat: p.lat, lng: p.lng, members: [p] })
  }
  return pins.map((c) => ({ ...c, id: c.members.map((m) => m.id).join('+') }))
}

function groupLabel(members: Person[], meId: string) {
  const nameOf = (p: Person) => (p.id === meId ? 'You' : p.name)
  if (members.length === 1) return nameOf(members[0])
  const city = members[0].city
  if (city && members.every((m) => m.city === city)) return `${members.length} in ${city}`
  if (members.length === 2) return `${nameOf(members[0])} & ${nameOf(members[1])}`
  return `${nameOf(members[0])} +${members.length - 1}`
}
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
  const pinEls = useRef(new Map<string, { root: HTMLElement; av: HTMLElement; name: HTMLElement }>())
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

  const pins = useMemo(() => clusterPeople(people), [people])

  // One pin per place. People within ~250 km share a pin: their avatars sit side by side.
  const makePin = useCallback(
    (d: object) => {
      const { members } = d as Pin
      const root = document.createElement('div')
      root.className = 'globe-pin' + (members.length > 1 ? ' cluster' : '')
      root.innerHTML = '<span class="inner"><span class="avs"></span><span class="nub"></span><span class="name"></span></span>'
      const row = root.querySelector('.avs') as HTMLElement
      const name = root.querySelector('.name') as HTMLElement
      const label = groupLabel(members, meId)
      name.textContent = label
      const shown = members.length > MAX_AVATARS ? MAX_AVATARS - 1 : members.length
      members.forEach((person, i) => {
        const [from, to] = gradientFor(person.id)
        const b = document.createElement('button')
        b.type = 'button'
        b.tabIndex = -1 // keyboard users use the People list
        b.className = 'av' + (person.notes ? '' : ' pending') + (i >= shown ? ' extra' : '')
        b.style.background = `linear-gradient(160deg, ${from}, ${to})`
        b.style.zIndex = String(members.length - i)
        b.textContent = person.id === meId ? 'Me' : initialOf(person.name)
        b.setAttribute('aria-label', `Open ${person.name}'s page`)
        b.title = `${person.name}, ${person.city ?? ''} ${localTime(person.tz)}`.trim()
        b.onclick = (e) => {
          e.stopPropagation()
          onSelectRef.current(person.id)
        }
        b.onmouseenter = () => (name.textContent = person.id === meId ? 'You' : person.name)
        b.onmouseleave = () => (name.textContent = root.dataset.label ?? label)
        row.append(b)
        pinEls.current.set(person.id, { root, av: b, name })
      })
      if (shown < members.length) {
        const more = document.createElement('button')
        more.type = 'button'
        more.tabIndex = -1
        more.className = 'av more'
        more.textContent = `+${members.length - shown}`
        more.setAttribute('aria-label', `Show ${members.length - shown} more`)
        more.onclick = (e) => {
          e.stopPropagation()
          root.classList.add('expanded')
        }
        row.append(more)
      }
      root.dataset.label = label
      root.dataset.base = label
      return root
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
    pinEls.current.forEach(({ root }) => root.classList.remove('sel'))
    pinEls.current.forEach(({ root, av, name }, id) => {
      const on = id === selectedId
      av.classList.toggle('sel', on)
      if (on) {
        root.classList.add('sel')
        // Open a crowded pin so the selected person is visible, and name them.
        if (av.classList.contains('extra')) root.classList.add('expanded')
        root.dataset.label = id === meId ? 'You' : (people.find((p) => p.id === id)?.name ?? '')
        name.textContent = root.dataset.label
      }
    })
    pinEls.current.forEach(({ root, name }) => {
      if (!root.classList.contains('sel') && root.dataset.base) {
        root.dataset.label = root.dataset.base
        name.textContent = root.dataset.base
      }
    })
    const g = ref.current
    if (!g) return
    const controls = g.controls() as unknown as { autoRotate: boolean }
    controls.autoRotate = !selectedId && !reduceMotion
    if (target && target.lat !== null && target.lng !== null) {
      const pov =
        sheet === 'bottom'
          ? { lat: target.lat - 14, lng: target.lng, altitude: 2 }
          : { lat: target.lat, lng: target.lng - (sheet === 'left' ? 24 : 0), altitude: 1.5 }
      g.pointOfView(pov, reduceMotion ? 0 : 1100)
    }
  }, [selectedId, target, sheet, people, meId, pins])

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
    const start = me?.lat != null ? me : pins[0]?.members[0]
    g.pointOfView(
      start && start.lat !== null && start.lng !== null
        ? sheet === 'bottom'
          ? { lat: start.lat - 12, lng: start.lng + 20, altitude: 2.6 }
          : { lat: start.lat - 8, lng: start.lng - (sheet === 'left' ? 10 : 0), altitude: 2.2 }
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
