import { mkdirSync } from 'fs'
import { join, basename, extname, sep } from 'path'
import { app } from 'electron'

// When running from a packaged asar, native binaries live in app.asar.unpacked.
// The installer packages resolve their path to inside app.asar, which can't execute.
export function unpackedPath(p: string): string {
  return p.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`)
}

// Compressed files land in a private temp folder until the user
// explicitly downloads them via the Download button.
export function resolveOutputPath(inputPath: string, newExt: string): string {
  const tempDir = join(app.getPath('temp'), 'fomp')
  mkdirSync(tempDir, { recursive: true })
  const base = basename(inputPath, extname(inputPath))
  // Timestamp suffix prevents name collisions when the same file is compressed twice
  return join(tempDir, `${base}_${Date.now()}${newExt}`)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function calcRatio(original: number, output: number): number {
  if (original === 0) return 0
  return Math.round(((original - output) / original) * 1000) / 10
}
