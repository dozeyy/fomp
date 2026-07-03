import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from '@ffmpeg-installer/ffmpeg'
import ffprobePath from '@ffprobe-installer/ffprobe'
import { statSync, existsSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { CompressionJob, COMPRESSION_SAFETY_FACTOR, MinVideoResolution } from '../../shared/types'
import { settingsStore } from '../settings/store'
import { resolveOutputPath, unpackedPath } from './utils'

ffmpeg.setFfmpegPath(unpackedPath(ffmpegPath.path))
ffmpeg.setFfprobePath(unpackedPath(ffprobePath.path))

const NULL_DEVICE = process.platform === 'win32' ? 'NUL' : '/dev/null'

interface ProgressCallback {
  (stage: string, progress: number): void
}

interface VideoProbe {
  duration: number
  width: number
  height: number
  audioBitrate: number
  hasAudio: boolean
  fps: number
}

interface VideoParams {
  videoBitrateKbps: number
  audioBitrateKbps: number
  width: number
  height: number
  fps: number
}

// Resolution tiers with the minimum bitrate (kbps) needed to look acceptable at that resolution.
const RESOLUTION_TIERS = [
  { height: 2160, minBitrateKbps: 8000 },
  { height: 1440, minBitrateKbps: 4000 },
  { height: 1080, minBitrateKbps: 1500 },
  { height: 720,  minBitrateKbps: 700  },
  { height: 480,  minBitrateKbps: 400  },
] as const

const FLOOR_HEIGHT: Record<MinVideoResolution, number> = {
  '1080p': 1080,
  '720p':  720,
  '480p':  480,
}

export async function compressVideo(
  job: CompressionJob,
  onProgress: ProgressCallback,
  cancelToken: { cancelled: boolean }
): Promise<{ outputPath: string; outputSize: number }> {
  const targetBytes = getTargetBytes(job)
  const settings = settingsStore.getAll()
  const minRes: MinVideoResolution = settings.minVideoResolution ?? '720p'
  const inputPath = job.filePath

  onProgress('detecting', 5)
  const probe = await probeVideo(inputPath)
  const outputPath = resolveOutputPath(inputPath, '.mp4')
  const params = calculateVideoParams(probe, targetBytes, minRes)

  // Use scale=-2:H so ffmpeg auto-calculates width from the source aspect ratio (always
  // divisible by 2). Force even height too. H.264 requires both dimensions to be even.
  const evenHeight = Math.floor(params.height / 2) * 2
  const vfFilter = `scale=-2:${evenHeight},format=yuv420p`

  const logDir = join(app.getPath('temp'), 'fomp-logs')
  mkdirSync(logDir, { recursive: true })
  const logFile = join(logDir, `pass_${Date.now()}`).replace(/\\/g, '/')

  try {
    onProgress('encoding', 10)

    let usedSinglePass = false
    try {
      await runPass1(inputPath, params, logFile, vfFilter, onProgress, cancelToken)
      if (cancelToken.cancelled) throw new Error('Cancelled')

      onProgress('encoding', 45)
      await runPass2(inputPath, outputPath, params, probe, logFile, vfFilter, onProgress, cancelToken)
    } catch (twoPassErr) {
      if (cancelToken.cancelled || (twoPassErr as Error).message === 'Cancelled') {
        throw twoPassErr
      }
      // Two-pass failed (VFR timestamps, unusual input codec, etc.) — fall back to
      // single-pass CBR which is more tolerant of problematic source files.
      if (existsSync(outputPath)) try { unlinkSync(outputPath) } catch { /* ignore */ }
      usedSinglePass = true
      onProgress('encoding', 50)
      await runSinglePass(inputPath, outputPath, params, probe, vfFilter, onProgress, cancelToken)
    }

    void usedSinglePass
  } finally {
    for (const suffix of ['-0.log', '-0.log.mbtree']) {
      const f = `${logFile}${suffix}`
      if (existsSync(f)) try { unlinkSync(f) } catch { /* ignore */ }
    }
  }

  onProgress('finalizing', 100)
  const outputSize = statSync(outputPath).size
  return { outputPath, outputSize }
}

function probeVideo(filePath: string): Promise<VideoProbe> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err)

      const videoStream = data.streams.find((s) => s.codec_type === 'video')
      const audioStream = data.streams.find((s) => s.codec_type === 'audio')

      const duration = Math.max(1, parseFloat(String(data.format.duration ?? '0')))
      const width = videoStream?.width ?? 1280
      const height = videoStream?.height ?? 720
      const fpsStr = videoStream?.r_frame_rate ?? '30/1'
      const [num, den] = fpsStr.split('/').map(Number)
      const fps = Math.min(den ? num / den : 30, 60)
      const audioBitrate = audioStream?.bit_rate ? parseInt(audioStream.bit_rate) / 1000 : 128
      const hasAudio = !!audioStream

      resolve({ duration, width, height, fps, audioBitrate, hasAudio })
    })
  })
}

function calculateVideoParams(
  probe: VideoProbe,
  targetBytes: number,
  minResolution: MinVideoResolution
): VideoParams {
  const audioBitrateKbps = Math.min(128, Math.max(64, Math.floor(probe.audioBitrate)))
  const audioBits = probe.hasAudio ? audioBitrateKbps * 1000 * probe.duration : 0
  const videoBitsAvailable = Math.max(0, targetBytes * 8 - audioBits)
  const idealBitrateKbps = Math.floor(videoBitsAvailable / probe.duration / 1000)

  const floorHeight = FLOOR_HEIGHT[minResolution]

  const sourceBelowFloor = probe.height < floorHeight
  const validTiers = RESOLUTION_TIERS.filter((t) =>
    t.height <= probe.height && (sourceBelowFloor || t.height >= floorHeight)
  )

  if (validTiers.length === 0) {
    const bitrateKbps = Math.max(300, Math.min(idealBitrateKbps, 8000))
    return {
      videoBitrateKbps: bitrateKbps,
      audioBitrateKbps,
      width: probe.width,
      height: probe.height,
      fps: clampFps(probe.fps, bitrateKbps),
    }
  }

  let selectedTier = validTiers.find((t) => idealBitrateKbps >= t.minBitrateKbps)
  if (!selectedTier) selectedTier = validTiers[validTiers.length - 1]

  let width = probe.width
  let height = probe.height
  if (selectedTier.height < probe.height) {
    const scale = selectedTier.height / probe.height
    height = selectedTier.height
    width = Math.max(2, Math.floor(probe.width * scale / 2) * 2)
  }

  const videoBitrateKbps = Math.min(
    8000,
    Math.max(selectedTier.minBitrateKbps, idealBitrateKbps)
  )

  return {
    videoBitrateKbps,
    audioBitrateKbps,
    width,
    height,
    fps: clampFps(probe.fps, videoBitrateKbps),
  }
}

function clampFps(originalFps: number, bitrateKbps: number): number {
  if (originalFps > 30 && bitrateKbps < 1000) return 30
  if (originalFps > 24 && bitrateKbps < 500) return 24
  return originalFps
}

function applyAudio(
  cmd: ReturnType<typeof ffmpeg>,
  params: VideoParams,
  probe: VideoProbe
): void {
  if (probe.hasAudio) {
    cmd.audioCodec('aac').outputOptions([`-b:a ${params.audioBitrateKbps}k`])
  } else {
    cmd.outputOptions(['-an'])
  }
}

function runPass1(
  inputPath: string,
  params: VideoParams,
  logFile: string,
  vfFilter: string,
  onProgress: ProgressCallback,
  cancelToken: { cancelled: boolean }
): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd: ReturnType<typeof ffmpeg>
    cmd = ffmpeg(inputPath)
      .inputOptions(['-fflags +genpts'])
      .videoCodec('libx264')
      .outputOptions([
        `-vf ${vfFilter}`,
        `-b:v ${params.videoBitrateKbps}k`,
        `-maxrate ${Math.floor(params.videoBitrateKbps * 1.5)}k`,
        `-bufsize ${params.videoBitrateKbps * 2}k`,
        `-preset fast`,
        `-pass 1`,
        `-passlogfile ${logFile}`,
        `-an`,
        `-f null`,
      ])
      .on('progress', (p) => {
        if (cancelToken.cancelled) { cmd.kill('SIGKILL'); return }
        onProgress('encoding', 10 + Math.floor((p.percent ?? 0) * 0.32))
      })
      .on('end', resolve)
      .on('error', (err, _stdout, stderr) => {
        if (!cancelToken.cancelled) {
          const detail = stderr ? stderr.split('\n').filter(Boolean).slice(-3).join(' | ') : ''
          reject(new Error(`${err.message}${detail ? ` — ${detail}` : ''}`))
        }
      })
      .save(NULL_DEVICE)
  })
}

function runPass2(
  inputPath: string,
  outputPath: string,
  params: VideoParams,
  probe: VideoProbe,
  logFile: string,
  vfFilter: string,
  onProgress: ProgressCallback,
  cancelToken: { cancelled: boolean }
): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd: ReturnType<typeof ffmpeg>
    cmd = ffmpeg(inputPath)
      .inputOptions(['-fflags +genpts'])
      .videoCodec('libx264')
      .outputOptions([
        `-vf ${vfFilter}`,
        `-b:v ${params.videoBitrateKbps}k`,
        `-maxrate ${Math.floor(params.videoBitrateKbps * 1.5)}k`,
        `-bufsize ${params.videoBitrateKbps * 2}k`,
        `-preset fast`,
        `-pass 2`,
        `-passlogfile ${logFile}`,
        `-movflags +faststart`,
      ])

    applyAudio(cmd, params, probe)
    if (Math.abs(params.fps - probe.fps) > 0.5) cmd.fps(params.fps)

    cmd
      .on('progress', (p) => {
        if (cancelToken.cancelled) { cmd.kill('SIGKILL'); return }
        onProgress('encoding', 45 + Math.floor((p.percent ?? 0) * 0.5))
      })
      .on('end', () => {
        if (cancelToken.cancelled) return reject(new Error('Cancelled'))
        resolve()
      })
      .on('error', (err, _stdout, stderr) => {
        if (!cancelToken.cancelled) {
          const detail = stderr ? stderr.split('\n').filter(Boolean).slice(-3).join(' | ') : ''
          reject(new Error(`${err.message}${detail ? ` — ${detail}` : ''}`))
        }
      })
      .save(outputPath)
  })
}

// Single-pass CBR fallback: less accurate file size targeting but handles unusual
// inputs (VFR, HEVC source, HDR, non-standard color spaces) that break two-pass.
function runSinglePass(
  inputPath: string,
  outputPath: string,
  params: VideoParams,
  probe: VideoProbe,
  vfFilter: string,
  onProgress: ProgressCallback,
  cancelToken: { cancelled: boolean }
): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd: ReturnType<typeof ffmpeg>
    cmd = ffmpeg(inputPath)
      .inputOptions(['-fflags +genpts'])
      .videoCodec('libx264')
      .outputOptions([
        `-vf ${vfFilter}`,
        `-b:v ${params.videoBitrateKbps}k`,
        `-maxrate ${params.videoBitrateKbps * 2}k`,
        `-bufsize ${params.videoBitrateKbps * 4}k`,
        `-preset fast`,
        `-movflags +faststart`,
      ])

    applyAudio(cmd, params, probe)
    if (Math.abs(params.fps - probe.fps) > 0.5) cmd.fps(params.fps)

    cmd
      .on('progress', (p) => {
        if (cancelToken.cancelled) { cmd.kill('SIGKILL'); return }
        onProgress('encoding', 50 + Math.floor((p.percent ?? 0) * 0.45))
      })
      .on('end', () => {
        if (cancelToken.cancelled) return reject(new Error('Cancelled'))
        resolve()
      })
      .on('error', (err, _stdout, stderr) => {
        if (!cancelToken.cancelled) {
          const detail = stderr ? stderr.split('\n').filter(Boolean).slice(-3).join(' | ') : ''
          reject(new Error(`${err.message}${detail ? ` — ${detail}` : ''}`))
        }
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
