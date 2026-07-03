import { statSync } from 'fs'
import { basename } from 'path'
import { v4 as uuid } from 'uuid'
import { BrowserWindow } from 'electron'
import { CompressionJob, CompressionMode } from '../../shared/types'
import { SimpleQueue } from './queue'
import { detectCategory } from './detect'
import { compressImage } from './image'
import { compressVideo } from './video'
import { compressAudio } from './audio'
import { compressDocument } from './document'
import { settingsStore } from '../settings/store'
import { historyStore } from '../history/store'
import { calcRatio } from './utils'

const cancelTokens = new Map<string, { cancelled: boolean }>()

export function createCompressionEngine(getWindow: () => BrowserWindow | null) {
  const settings = settingsStore.getAll()

  const queue = new SimpleQueue(settings.parallelThreads ?? 2)

  function emit(channel: string, data: unknown): void {
    getWindow()?.webContents.send(channel, data)
  }

  async function enqueue(
    filePath: string,
    mode?: CompressionMode,
    targetSizeMB?: number
  ): Promise<string> {
    const id = uuid()
    const fileName = basename(filePath)
    let originalSize: number

    try {
      originalSize = statSync(filePath).size
    } catch {
      throw new Error(`Cannot access file: ${filePath}`)
    }

    const category = detectCategory(filePath)
    const effectiveMode = mode ?? settingsStore.get('defaultMode') ?? 'auto'
    const effectiveTarget = targetSizeMB ?? settingsStore.get('targetSizeMB') ?? 25

    const job: CompressionJob = {
      id,
      filePath,
      fileName,
      originalSize,
      category,
      mode: effectiveMode,
      targetSizeMB: effectiveTarget,
      status: 'queued',
      progress: 0
    }

    cancelTokens.set(id, { cancelled: false })

    const targetBytes = effectiveTarget * 1024 * 1024

    // If the file is already under the target, skip compression entirely.
    if (originalSize <= targetBytes) {
      const alreadyDoneJob: CompressionJob = {
        ...job,
        status: 'completed',
        progress: 100,
        outputPath: filePath,
        outputSize: originalSize,
        compressionRatio: 0,
        completedAt: Date.now(),
        discordReady: true,
        alreadyUnderLimit: true
      }
      emit('compress:complete', alreadyDoneJob)
      return id
    }

    emit('compress:queue-update', job)

    queue.add(async (): Promise<void> => {
      const token = cancelTokens.get(id)!
      if (token.cancelled) return

      emit('compress:queue-update', { ...job, status: 'processing', stage: 'detecting', progress: 0 })

      const onProgress = (stage: string, progress: number) => {
        if (token.cancelled) return
        emit('compress:progress', { id, stage, progress })
      }

      try {
        let result: { outputPath: string; outputSize: number }

        if (category === 'image') {
          result = await compressImage({ ...job, status: 'processing' }, onProgress)
        } else if (category === 'video') {
          result = await compressVideo({ ...job, status: 'processing' }, onProgress, token)
        } else if (category === 'audio') {
          result = await compressAudio({ ...job, status: 'processing' }, onProgress, token)
        } else {
          result = await compressDocument({ ...job, status: 'processing' }, onProgress)
        }

        if (token.cancelled) {
          emit('compress:queue-update', { ...job, status: 'cancelled' })
          return
        }

        const discordReady = result.outputSize <= targetBytes
        const nearLimit = result.outputSize > targetBytes * 0.9 && discordReady
        // Flag max compression: file was compressed significantly but still over limit
        const maxCompressionReached = !discordReady && result.outputSize < originalSize * 0.99

        const completedJob: CompressionJob = {
          ...job,
          status: 'completed',
          progress: 100,
          outputPath: result.outputPath,
          outputSize: result.outputSize,
          compressionRatio: calcRatio(originalSize, result.outputSize),
          completedAt: Date.now(),
          discordReady,
          nearLimit,
          maxCompressionReached
        }

        historyStore.add({
          id,
          fileName,
          originalSize,
          outputSize: result.outputSize,
          compressionRatio: calcRatio(originalSize, result.outputSize),
          outputPath: result.outputPath,
          category,
          mode: effectiveMode,
          createdAt: Date.now(),
          discordReady
        })

        emit('compress:complete', completedJob)
      } catch (err: unknown) {
        if (token.cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        emit('compress:error', { id, error: msg })
      }
    })

    return id
  }

  function cancel(id: string): void {
    const token = cancelTokens.get(id)
    if (token) token.cancelled = true
  }

  function cancelAll(): void {
    for (const token of cancelTokens.values()) {
      token.cancelled = true
    }
    queue.clear()
  }

  return { enqueue, cancel, cancelAll }
}
