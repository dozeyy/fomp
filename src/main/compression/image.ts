import sharp from 'sharp'
import { statSync } from 'fs'
import { extname } from 'path'
import { CompressionJob, COMPRESSION_SAFETY_FACTOR } from '../../shared/types'
import { settingsStore } from '../settings/store'
import { resolveOutputPath } from './utils'

interface ProgressCallback {
  (stage: string, progress: number): void
}

export async function compressImage(
  job: CompressionJob,
  onProgress: ProgressCallback
): Promise<{ outputPath: string; outputSize: number }> {
  const targetBytes = getTargetBytes(job)
  const inputPath = job.filePath
  const ext = extname(inputPath).toLowerCase()

  onProgress('detecting', 5)

  const metadata = await sharp(inputPath).metadata()
  const originalSize = statSync(inputPath).size

  // If already small enough, just copy with minimal processing
  if (originalSize <= targetBytes) {
    onProgress('optimizing', 50)
    const outputPath = resolveOutputPath(inputPath, '.webp')
    await sharp(inputPath).webp({ quality: 95, effort: 4 }).toFile(outputPath)
    const outputSize = statSync(outputPath).size

    // If webp is larger, keep original
    if (outputSize >= originalSize) {
      const origOutputPath = resolveOutputPath(inputPath, ext)
      await sharp(inputPath).toFile(origOutputPath)
      onProgress('finalizing', 100)
      return { outputPath: origOutputPath, outputSize: statSync(origOutputPath).size }
    }
    onProgress('finalizing', 100)
    return { outputPath, outputSize }
  }

  onProgress('encoding', 20)

  // Binary search for the right quality setting
  const result = await findOptimalQuality(inputPath, metadata, targetBytes, onProgress)
  return result
}

async function findOptimalQuality(
  inputPath: string,
  metadata: sharp.Metadata,
  targetBytes: number,
  onProgress: ProgressCallback
): Promise<{ outputPath: string; outputSize: number }> {
  const width = metadata.width ?? 3840
  const height = metadata.height ?? 2160

  let lo = 1
  let hi = 95
  let bestOutput: Buffer | null = null
  let bestSize = 0
  let iteration = 0
  const maxIterations = 8

  onProgress('encoding', 30)

  // Try WebP first (best compression)
  while (lo <= hi && iteration < maxIterations) {
    const mid = Math.max(1, Math.floor((lo + hi) / 2))
    const buf = await sharp(inputPath)
      .webp({ quality: mid, effort: 4 })
      .toBuffer()

    if (buf.length <= targetBytes) {
      bestOutput = buf
      bestSize = buf.length
      lo = mid + 1
    } else {
      hi = mid - 1
    }
    iteration++
    onProgress('encoding', 30 + (iteration / maxIterations) * 40)
    // Stop early if quality is already at minimum
    if (mid === 1 && buf.length > targetBytes) break
  }

  // If we still can't hit target, try resizing
  if (!bestOutput) {
    onProgress('resizing', 70)
    bestOutput = await tryWithResize(inputPath, targetBytes, width, height)
    bestSize = bestOutput?.length ?? 0
  }

  onProgress('finalizing', 90)

  const outputPath = resolveOutputPath(inputPath, '.webp')

  if (bestOutput && bestSize > 0) {
    const { writeFile } = await import('fs/promises')
    await writeFile(outputPath, bestOutput)
    onProgress('finalizing', 100)
    return { outputPath, outputSize: bestSize }
  }

  // Last resort: minimum quality, half resolution
  const lastResort = await sharp(inputPath)
    .resize({ width: Math.floor(width / 2), height: Math.floor(height / 2), fit: 'inside' })
    .webp({ quality: 20, effort: 6 })
    .toBuffer()

  const { writeFile } = await import('fs/promises')
  await writeFile(outputPath, lastResort)
  onProgress('finalizing', 100)
  return { outputPath, outputSize: lastResort.length }
}

async function tryWithResize(
  inputPath: string,
  targetBytes: number,
  originalWidth: number,
  originalHeight: number
): Promise<Buffer | null> {
  const scales = [0.75, 0.5, 0.35, 0.25]

  for (const scale of scales) {
    const newWidth = Math.floor(originalWidth * scale)
    const newHeight = Math.floor(originalHeight * scale)

    // Binary search quality at this scale
    let lo = 1
    let hi = 90
    let best: Buffer | null = null

    for (let i = 0; i < 8; i++) {
      if (lo > hi) break
      const mid = Math.max(1, Math.floor((lo + hi) / 2))
      const buf = await sharp(inputPath)
        .resize({ width: newWidth, height: newHeight, fit: 'inside' })
        .webp({ quality: mid, effort: 4 })
        .toBuffer()

      if (buf.length <= targetBytes) {
        best = buf
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    if (best) return best
  }

  return null
}

function getTargetBytes(job: CompressionJob): number {
  const settings = settingsStore.getAll()
  const mb = job.mode === 'auto' && settings.autoFitDiscord
    ? 8
    : (job.targetSizeMB || settings.targetSizeMB || 10)
  return mb * COMPRESSION_SAFETY_FACTOR * 1024 * 1024
}
