interface Props {
  size?: number
}

export function AppIcon({ size = 32 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <rect width="32" height="32" rx="7" fill="#0F1016" />

      {/* Large file shape with folded corner — represents original file */}
      <path d="M7.5 3 H19.5 L25 8.5 V15.5 H7.5 Z" fill="#5865F2" />
      {/* Corner fold highlight */}
      <path d="M19.5 3 L19.5 8.5 L25 8.5" fill="rgba(255,255,255,0.15)" />

      {/* Downward arrow — the compression action */}
      <path d="M16 16.5 V20" stroke="#5865F2" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M13 18 L16 21 L19 18"
        stroke="#5865F2"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Smaller output file — represents the compressed result */}
      <rect x="11" y="23" width="10" height="5.5" rx="1.5" fill="#5865F2" opacity="0.6" />
    </svg>
  )
}
