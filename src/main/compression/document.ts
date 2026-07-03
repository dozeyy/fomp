import { statSync, createWriteStream, copyFileSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { extname } from 'path'
import { PDFDocument } from 'pdf-lib'
import archiver from 'archiver'
import { CompressionJob } from '../../shared/types'
import { resolveOutputPath } from './utils'

// These formats are already compressed — zipping them again won't help.
const ALREADY_COMPRESSED = new Set(['.zip', '.7z', '.rar', '.gz', '.bz2', '.xz', '.zst', '.br',
  '.mp4', '.mkv', '.mov', '.avi', '.webm', '.mp3', '.aac', '.ogg', '.flac', '.m4a',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.avif'])

interface ProgressCallback {
  (stage: string, progress: number): void
}

export async function compressDocument(
  job: CompressionJob,
  onProgress: ProgressCallback
): Promise<{ outputPath: string; outputSize: number }> {
  const ext = extname(job.filePath).toLowerCase()
  onProgress('detecting', 5)

  if (ext === '.pdf') {
    return compressPdf(job, onProgress)
  }

  // Already-compressed formats: re-wrapping in zip won't shrink them.
  // Copy as-is and surface the result so the user can see the true size.
  if (ALREADY_COMPRESSED.has(ext)) {
    onProgress('optimizing', 50)
    const originalSize = statSync(job.filePath).size
    const outputPath = resolveOutputPath(job.filePath, ext)
    copyFileSync(job.filePath, outputPath)
    onProgress('finalizing', 100)
    return { outputPath, outputSize: originalSize }
  }

  return compressToZip(job, onProgress)
}

async function compressPdf(
  job: CompressionJob,
  onProgress: ProgressCallback
): Promise<{ outputPath: string; outputSize: number }> {
  onProgress('optimizing', 20)

  const pdfBytes = await readFile(job.filePath)
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })

  onProgress('optimizing', 60)

  const compressedBytes = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false })

  const outputPath = resolveOutputPath(job.filePath, '.pdf')
  await writeFile(outputPath, compressedBytes)

  onProgress('finalizing', 100)

  const originalSize = statSync(job.filePath).size
  const outputSize = compressedBytes.length

  if (outputSize >= originalSize) {
    await writeFile(outputPath, pdfBytes)
    return { outputPath, outputSize: originalSize }
  }

  return { outputPath, outputSize }
}

async function compressToZip(
  job: CompressionJob,
  onProgress: ProgressCallback
): Promise<{ outputPath: string; outputSize: number }> {
  onProgress('encoding', 20)

  const outputPath = resolveOutputPath(job.filePath, '.zip')

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outputPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', resolve)
    archive.on('error', reject)

    archive.pipe(output)
    archive.file(job.filePath, { name: job.fileName })
    archive.finalize()
  })

  onProgress('finalizing', 100)
  const outputSize = statSync(outputPath).size
  return { outputPath, outputSize }
}
