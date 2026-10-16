import { useEffect, useMemo, useState } from 'react'
import { ClimberGlyph } from './BrandLogo'

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

/**
 * 山路十八弯：用明确拐点做起承转合，避免正弦叠线造成顶部锐角重叠。
 * side：相对中线的左右（-1 左 / +1 右），幅度随海拔缓收。
 */
function buildRoute(
  main: ReadonlyArray<readonly [number, number]>,
  summit: readonly [number, number],
) {
  const [sx, sy] = summit
  const rise = 455
  const run = 330
  const amp = 52

  // t 均匀爬升 → 弯与弯之间留出竖向间距；side 控制之字开合
  const turns: Array<{ t: number; side: number }> = [
    // 起：山脚入径，弯宽而缓
    { t: 0.00, side: 0.25 },
    { t: 0.07, side: -0.95 },
    { t: 0.15, side: 1.0 },
    // 承：均匀之字，节奏稳定
    { t: 0.24, side: -1.05 },
    { t: 0.33, side: 1.05 },
    { t: 0.42, side: -1.0 },
    { t: 0.51, side: 1.0 },
    // 转：中上段略放宽，再收回——转折最醒目
    { t: 0.60, side: -1.15 },
    { t: 0.70, side: 1.1 },
    { t: 0.80, side: -0.75 },
    // 合：不再急折，轻柔收束入顶
    { t: 0.88, side: 0.28 },
    { t: 0.94, side: -0.08 },
    { t: 1.00, side: 0 },
  ]

  return turns.map(({ t, side }, i) => {
    if (i === turns.length - 1) return [sx, sy + 3] as [number, number]
    // 上段略收幅度，但保持竖向间距，防止笔画叠在一起
    const spread = amp * (1 - t * 0.42)
    const y = sy + (1 - t) * rise
    const x = sx - (1 - t) * run + side * spread
    const ground = heightAt(main, x)
    return [x, Math.max(y, ground + 7 + (1 - t) * 6)] as [number, number]
  })
}

/** 拐点处用二次贝塞尔圆角，拐弯顺滑、不起毛刺 */
function toSwitchbackPath(points: ReadonlyArray<readonly [number, number]>) {
  if (points.length < 2) return ''
  const [x0, y0] = points[0]
  let d = `M${x0.toFixed(1)} ${y0.toFixed(1)}`
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1]
    const [cx, cy] = points[i]
    const [nx, ny] = points[i + 1]
    const len1 = Math.hypot(cx - px, cy - py) || 1
    const len2 = Math.hypot(nx - cx, ny - cy) || 1
    // 圆角半径随段长，且上限克制，避免相邻弯挤在一起
    const r = Math.min(18, len1 * 0.28, len2 * 0.28)
    const ax = cx - ((cx - px) / len1) * r
    const ay = cy - ((cy - py) / len1) * r
    const bx = cx + ((nx - cx) / len2) * r
    const by = cy + ((ny - cy) / len2) * r
    d += ` L${ax.toFixed(1)} ${ay.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`
  }
  const [lx, ly] = points[points.length - 1]
  d += ` L${lx.toFixed(1)} ${ly.toFixed(1)}`
  return d
}

export function AlpineScene() {
  const reduced = useReducedMotion()

  const scene = useMemo(() => {
    const far = ridge(11, 640, [{ x: 300, h: 110, w: 180 }, { x: 640, h: 70, w: 160 }, { x: 1500, h: 170, w: 160 }], 110)
    // 主峰：更宽、略矮 → 山脊拉长、坡度放缓
    const main = ridge(29, 720, [
      { x: 1180, h: 300, w: 520 },
      { x: 1180, h: 70, w: 70 },
      { x: 980, h: 55, w: 90 },
      { x: 1380, h: 50, w: 100 },
      { x: 1480, h: 140, w: 160 },
      { x: 520, h: 65, w: 240 },
    ], 140)
    const mid = ridge(5, 780, [{ x: 180, h: 130, w: 200 }, { x: 860, h: 60, w: 220 }, { x: 1560, h: 110, w: 170 }], 80)
    const front = ridge(41, 860, [{ x: 420, h: 40, w: 220 }, { x: 1260, h: 50, w: 220 }], 50)

    const summit = main.reduce((top, p) => (p[1] < top[1] ? p : top))
    const routePts = buildRoute(main, summit)

    const rand = random(3)
    const stars = Array.from({ length: 34 }, () => ({ x: rand() * W, y: rand() * 300, r: 0.4 + rand() * 0.9 }))

    return {
      far: toPath(far),
      main: toPath(main),
      mid: toPath(mid),
      front: toPath(front),
      summit,
      route: toSwitchbackPath(routePts),
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
          <radialGradient id="al-lamp" cx="50%" cy="60%" r="50%">
            <stop offset="0" stopColor="#fff6e6" stopOpacity="0.95" />
            <stop offset="0.35" stopColor="#ffc48a" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ff7a3d" stopOpacity="0" />
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

        <path className="al-route" d={scene.route} pathLength={1} fill="none" stroke="#ff7a3d" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
        {/* 登顶后插上的小红旗：小人抵达峰顶时升起并留在山顶 */}
        <g className="al-flag" transform={`translate(${sx} ${sy + 2})`} opacity={reduced ? 1 : 0}>
          <g>
            <line x1="0" y1="2" x2="0" y2="-16" stroke="#f4efe6" strokeWidth="1.35" strokeLinecap="round" />
            <path d="M0.4 -15.2 L11.5 -11.2 L0.4 -7.2 Z" fill="#e23d3d" />
            <circle cx="0" cy="2.2" r="1.6" fill="#ff7a3d" />
            {!reduced && (
              <animateTransform
                attributeName="transform"
                type="scale"
                values="0.15;1.15;1"
                keyTimes="0;0.55;1"
                begin="27.2s"
                dur="0.55s"
                fill="freeze"
              />
            )}
          </g>
          {!reduced && (
            <animate attributeName="opacity" from="0" to="1" begin="27.2s" dur="0.4s" fill="freeze" />
          )}
        </g>
        {!reduced && (
          <g className="al-climber" opacity="0">
            <ellipse cx="0" cy="-6" rx="18" ry="20" fill="url(#al-lamp)" />
            <g style={{ filter: 'drop-shadow(0 0 3px rgba(255,246,230,0.85))' }}>
              <ClimberGlyph fill="#fff6e6" scale={0.85} />
              <ClimberGlyph fill="#ff9a55" scale={0.72} />
            </g>
            <animateMotion dur="22s" begin="7.4s" repeatCount="indefinite" path={scene.route} />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.04;0.92;1" dur="22s" begin="7.4s" repeatCount="indefinite" />
          </g>
        )}

        <path d={scene.mid} fill="url(#al-mid)" />
        <path d={scene.front} fill="url(#al-front)" />
      </svg>
    </div>
  )
}
