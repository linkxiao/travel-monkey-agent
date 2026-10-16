/** Travel Monkey 标识：峰径 —— 旅人走向山脊 */

type BrandLogoProps = {
  /** 图标边长，默认 22 */
  size?: number
  /** 是否显示文字 Travel Monkey */
  wordmark?: boolean
  className?: string
  title?: string
  /** gate 页用更大字号与间距 */
  large?: boolean
}

/**
 * 侧身旅人剪影（本地坐标：脚底约在原点，头朝上）。
 * 背景攀登动画与 Logo 共用同一形象。
 */
export function ClimberGlyph({
  fill = '#ff7a3d',
  scale = 1,
}: {
  fill?: string
  scale?: number
}) {
  return (
    <g fill={fill} transform={`scale(${scale}) translate(-7.2 -23.5)`}>
      <circle cx="7.2" cy="9.6" r="2.7" />
      <rect x="5.85" y="12.2" width="2.9" height="4.5" rx="1.25" />
      <ellipse cx="4.5" cy="14.25" rx="1.55" ry="1.85" />
      <path d="M8.6 13.25 L12.15 12.05 L12.55 13.45 L9.1 14.55 Z" />
      <path d="M6.95 16.4 L9.4 22.85 L11.15 22.05 L8.7 16.15 Z" />
      <path d="M6.55 16.55 L3.5 22.65 L5.3 23.45 L7.75 17.2 Z" />
    </g>
  )
}

function MarkArt() {
  return (
    <>
      <path
        d="M13 24.5 L17.5 14.5 L20.5 19 L25.2 8.5 L30.5 24.5"
        fill="none"
        stroke="#dce3ef"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <g transform="translate(7.2 23.5)">
        <ClimberGlyph />
      </g>
    </>
  )
}

export function BrandMark({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={`brand-logo-mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="#0b1226" />
      <MarkArt />
    </svg>
  )
}

export function BrandLogo({
  size = 22,
  wordmark = true,
  className = '',
  title,
  large,
}: BrandLogoProps) {
  const cls = ['brand-logo', large ? 'large' : '', className].filter(Boolean).join(' ')
  return (
    <span className={cls} title={title}>
      <BrandMark size={size} />
      {wordmark && <span className="brand-logo-word">Travel Monkey</span>}
    </span>
  )
}
