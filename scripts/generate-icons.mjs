import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const buildDir = join(root, 'build')
mkdirSync(buildDir, { recursive: true })

// Matches the AppIcon component design scaled to 512×512.
// Coordinates are AppIcon 32×32 values × 16.
const SVG = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="512" height="512" rx="112" fill="#0F1016"/>

  <!-- Large file with corner fold (original file) -->
  <path d="M120 48 H312 L400 136 V248 H120 Z" fill="#5865F2"/>
  <!-- Corner fold highlight -->
  <path d="M312 48 L312 136 L400 136" fill="rgba(255,255,255,0.15)"/>
  <!-- Subtle document lines inside the file body -->
  <line x1="152" y1="100" x2="296" y2="100" stroke="rgba(255,255,255,0.22)" stroke-width="14" stroke-linecap="round"/>
  <line x1="152" y1="152" x2="368" y2="152" stroke="rgba(255,255,255,0.16)" stroke-width="14" stroke-linecap="round"/>
  <line x1="152" y1="204" x2="312" y2="204" stroke="rgba(255,255,255,0.11)" stroke-width="14" stroke-linecap="round"/>

  <!-- Downward arrow (compression action) -->
  <line x1="256" y1="264" x2="256" y2="320" stroke="#5865F2" stroke-width="29" stroke-linecap="round"/>
  <path d="M208 288 L256 336 L304 288" stroke="#5865F2" stroke-width="29" stroke-linecap="round" stroke-linejoin="round" fill="none"/>

  <!-- Smaller output file (compressed result) -->
  <rect x="176" y="368" width="160" height="88" rx="24" fill="#5865F2" opacity="0.6"/>
</svg>`

async function main() {
  console.log('Generating app icons...')

  const png512 = await sharp(Buffer.from(SVG)).png().toBuffer()
  writeFileSync(join(buildDir, 'icon.png'), png512)
  console.log('  icon.png (512×512) ✓')

  const sizes = [16, 32, 48, 64, 128, 256]
  const pngBuffers = await Promise.all(
    sizes.map((s) => sharp(Buffer.from(SVG)).resize(s, s).png().toBuffer())
  )

  const icoBuffer = await pngToIco(pngBuffers)
  writeFileSync(join(buildDir, 'icon.ico'), icoBuffer)
  console.log('  icon.ico (16/32/48/64/128/256) ✓')

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
