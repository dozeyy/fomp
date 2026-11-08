interface Props {
  size?: number
}

// Same design as build/icon.png (scripts/generate-icons.mjs), on a 1024 grid.
export function AppIcon({ size = 32 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <rect width="1024" height="1024" rx="228" fill="#FFFFFF" />

      {/* File with its corner fold */}
      <path d="M352 206L570 206A8 8 0 0 1 578 214L578 365A50 50 0 0 0 628 415L716 415A8 8 0 0 1 724 423L724 767A52 52 0 0 1 672 819L352 819A52 52 0 0 1 300 767L300 258A52 52 0 0 1 352 206Z" fill="#F39841" />
      <path d="M598 249.91L598 365A30 30 0 0 0 628 395L716.87 395A14 14 0 0 0 727.8 372.25L622.93 241.17A14 14 0 0 0 598 249.91Z" fill="#F39841" />

      {/* Chevrons pressing in — the compression action */}
      <path
        d="M142 425L220 512L142 598M882 425L804 512L882 598"
        stroke="#F39841"
        strokeWidth="64"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
