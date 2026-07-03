import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from '@ffmpeg-installer/ffmpeg'
import ffprobePath from '@ffprobe-installer/ffprobe'
import { statSync } from 'fs'
import { CompressionJob, COMPRESSION_SAFETY_FACTOR } from '../../shared/types'
import { settingsStore } from '../settings/store'
import { resolveOutputPath, unpackedPath } from './utils'

ffmpeg.setFfmpegPath(unpackedPath(ffmpegPath.path))
ffmpeg.setFfprobePath(unpackedPath(ffprobePath.path))

interface ProgressCallback {
  (stage: string, progress: number): void
}

export async function compressAudio(
  job: CompressionJob,
  onProgress: ProgressCallback,
  cancelToken: { cancelled: boolean }
): Promise<{ outputPath: string; outputSize: number }> {
  const targetBytes = getTargetBytes(job)
  const inputPath = job.filePath
  const originalSize = statSync(inputPath).size

  onProgress('detecting', 5)

  const duration = await getAudioDuration(inputPath)
  const outputPath = resolveOutputPath(inputPath, '.mp3')

  onProgress('encoding', 10)

  // Calculate target bitrate
  const targetBits = targetBytes * 8
  const targetBitrateKbps = Math.floor(targetBits / duration / 1000)
  const clampedBitrate = Math.max(48, Math.min(320, targetBitrateKbps))

  await encodeAudio(inputPath, outputPath, clampedBitrate, onProgress, cancelToken)

  onProgress('finalizing', 100)
  const outputSize = statSync(outputPath).size
  return { outputPath, outputSize }
}

function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err)
      resolve(parseFloat(String(data.format.duration ?? '60')))
    })
  })
}

function encodeAudio(
  inputPath: string,
  outputPath: string,
  bitrateKbps: number,
  onProgress: ProgressCallback,
  cancelToken: { cancelled: boolean }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath)
      .audioCodec('libmp3lame')
      .audioBitrate(bitrateKbps)
      .outputOptions(['-q:a 2'])
      .on('progress', (p) => {
        if (cancelToken.cancelled) {
          cmd.kill('SIGKILL')
          return
        }
        onProgress('encoding', 10 + Math.floor((p.percent ?? 0) * 0.85))
      })
      .on('end', () => {
        if (cancelToken.cancelled) return reject(new Error('Cancelled'))
        resolve()
      })
      .on('error', (err) => {
        if (cancelToken.cancelled) return
        reject(err)
      })
      .save(outputPath)
  })
}

function getTargetBytes(job: CompressionJob): number {
  const settings = settingsStore.getAll()
  const mb = job.mode === 'auto' && settings.autoFitDiscord
    ? 25
    : (job.targetSizeMB || settings.targetSizeMB || 10)
  return mb * COMPRESSION_SAFETY_FACTOR * 1024 * 1024
}
