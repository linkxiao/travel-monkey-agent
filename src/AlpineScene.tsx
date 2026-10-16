import { useEffect, useMemo, useState } from 'react'

const W = 1600
const H = 900

type Bump = { x: number; h: number; w: number }

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(query.matches)
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return reduced
}

function random(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

/** Pointed peaks (exp(-|dx|/w)) plus midpoint-displacement roughness, sampled across the width. */
function ridge(seed: number, base: number, bumps: Bump[], rough: number) {
  const n = 256
  const rand = random(seed)
  const noise = new Array<number>(n + 1).fill(0)
  for (let step = n, amp = rough; step > 1; step /= 2, amp *= 0.62) {
    for (let i = step / 2; i < n; i += step) {
      noise[i] = (noise[i - step / 2] + noise[i + step / 2]) / 2 + (rand() - 0.5) * amp
    }
  }
  return noise.map((jitter, i) => {
    const x = (i / n) * W
    const lift = bumps.reduce((sum, b) => sum + b.h * Math.exp(-Math.abs(x - b.x) / b.w), 0)
    return [x, base - lift + jitter] as const
  })
}

function toPath(points: ReadonlyArray<readonly [number, number]>) {
  return `M0 ${H} ` + points.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ` L${W} ${H} Z`
}

function heightAt(points: ReadonlyArray<readonly [number, number]>, x: number) {
  const i = Math.min(points.length - 2, Math.floor((x / W) * (points.length - 1)))
  const [x0, y0] = points[i]
  const [x1, y1] = points[i + 1]
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
}

export function AlpineScene() {
  const reduced = useReducedMotion()

  const scene = useMemo(() => {
    const far = ridge(11, 640, [{ x: 300, h: 110, w: 180 }, { x: 640, h: 70, w: 160 }, { x: 1500, h: 170, w: 160 }], 110)
    const main = ridge(29, 720, [
      { x: 1130, h: 380, w: 300 },
      { x: 1130, h: 110, w: 40 },
      { x: 1035, h: 70, w: 45 },
      { x: 1250, h: 60, w: 50 },
      { x: 1420, h: 190, w: 110 },
      { x: 560, h: 70, w: 200 },
    ], 170)
    const mid = ridge(5, 780, [{ x: 180, h: 130, w: 200 }, { x: 860, h: 60, w: 220 }, { x: 1560, h: 110, w: 170 }], 80)
    const front = ridge(41, 860, [{ x: 420, h: 40, w: 220 }, { x: 1260, h: 50, w: 220 }], 50)

    const summit = main.reduce((top, p) => (p[1] < top[1] ? p : top))
    const route: Array<[number, number]> = []
    const steps = 9
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const y = summit[1] + (1 - t) * 330
      const x = summit[0] - (1 - t) * 150 + (i % 2 ? 22 : -18) * (1 - t)
      route.push([x, Math.max(y, heightAt(main, x) + 10 * (1 - t))])
    }
    route[steps] = [summit[0], summit[1] + 2]

    const rand = random(3)
    const stars = Array.from({ length: 34 }, () => ({ x: rand() * W, y: rand() * 300, r: 0.4 + rand() * 0.9 }))

    return {
      far: toPath(far),
      main: toPath(main),
      mid: toPath(mid),
      front: toPath(front),
      summit,
      route: 'M' + route.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L'),
      stars,
    }
  }, [])

  const [sx, sy] = scene.summit

  return (
    <div className="alpine" aria-hidden="true">
      <div className="sky-night" />
      <div className="sky-dawn" />
      <svg className="alpine-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="al-far" x1="0" y1="380" x2="0" y2="720" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#4e5487" />
            <stop offset="1" stopColor="#7f76a0" />
          </linearGradient>
          <linearGradient id="al-main" x1="0" y1={sy} x2="0" y2="780" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#2a3460" />
            <stop offset="0.7" stopColor="#3f4675" />
            <stop offset="1" stopColor="#6e6893" />
          </linearGradient>
          <linearGradient id="al-glow" x1="0" y1={sy} x2="0" y2={sy + 300} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffbe94" stopOpacity="0.9" />
            <stop offset="0.5" stopColor="#e0849a" stopOpacity="0.35" />
            <stop offset="1" stopColor="#e0849a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="al-snow" x1="0" y1={sy} x2="0" y2={sy + 150} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#f4f2f6" stopOpacity="0.85" />
            <stop offset="1" stopColor="#f4f2f6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="al-mid" x1="0" y1="620" x2="0" y2="860" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#151d3d" />
            <stop offset="1" stopColor="#353b68" />
          </linearGradient>
          <linearGradient id="al-front" x1="0" y1="780" x2="0" y2="900" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#090f25" />
            <stop offset="1" stopColor="#050a1a" />
          </linearGradient>
          <radialGradient id="al-lamp">
            <stop offset="0" stopColor="#fff1d6" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffb070" stopOpacity="0" />
          </radialGradient>
          <clipPath id="al-main-clip"><path d={scene.main} /></clipPath>
        </defs>

        <g className="al-stars" fill="#eef3f8">
          {scene.stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} />)}
        </g>

        <path d={scene.far} fill="url(#al-far)" />

        <path d={scene.main} fill="url(#al-main)" />
        <g clipPath="url(#al-main-clip)">
          <rect x="0" y={sy} width={W} height="150" fill="url(#al-snow)" />
          <rect className="al-glow" x="0" y={sy} width={W} height="300" fill="url(#al-glow)" />
        </g>

        <path className="al-route" d={scene.route} pathLength={1} fill="none" stroke="#ff7a3d" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        <circle className="al-summit" cx={sx} cy={sy + 2} r="2.4" fill="#ff7a3d" />
        {!reduced && (
          <g opacity="0">
            <circle r="10" fill="url(#al-lamp)" />
            <circle r="2" fill="#fff6e6" />
            <animateMotion dur="18s" begin="5.5s" repeatCount="indefinite" path={scene.route} />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.06;0.9;1" dur="18s" begin="5.5s" repeatCount="indefinite" />
          </g>
        )}

        <path d={scene.mid} fill="url(#al-mid)" />
        <path d={scene.front} fill="url(#al-front)" />
      </svg>
    </div>
  )
}
