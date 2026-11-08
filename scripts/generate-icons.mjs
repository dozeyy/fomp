import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const buildDir = join(root, 'build')
mkdirSync(buildDir, { recursive: true })

// Same design as the AppIcon component (1024 grid), rendered at 512×512.
// A file squeezed between two chevrons on a white rounded square.
const SVG = `<svg width="512" height="512" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="1024" height="1024" rx="228" fill="#FFFFFF"/>

  <!-- File with its corner fold -->
  <path d="M352 206L570 206A8 8 0 0 1 578 214L578 365A50 50 0 0 0 628 415L716 415A8 8 0 0 1 724 423L724 767A52 52 0 0 1 672 819L352 819A52 52 0 0 1 300 767L300 258A52 52 0 0 1 352 206Z" fill="#F39841"/>
  <path d="M598 249.91L598 365A30 30 0 0 0 628 395L716.87 395A14 14 0 0 0 727.8 372.25L622.93 241.17A14 14 0 0 0 598 249.91Z" fill="#F39841"/>

  <!-- Chevrons pressing in (compression) -->
  <path d="M142 425L220 512L142 598M882 425L804 512L882 598" stroke="#F39841" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/>
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
