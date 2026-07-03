export type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'unknown'

export type CompressionMode = 'auto' | 'target' | 'quality' | 'size'

export type CompressionStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type CompressionStage =
  | 'detecting'
  | 'encoding'
  | 'resizing'
  | 'optimizing'
  | 'finalizing'

export interface CompressionJob {
  id: string
  filePath: string
  fileName: string
  originalSize: number
  category: FileCategory
  mode: CompressionMode
  targetSizeMB?: number
  status: CompressionStatus
  stage?: CompressionStage
  progress: number
  outputPath?: string
  outputSize?: number
  compressionRatio?: number
  error?: string
  startedAt?: number
  completedAt?: number
  estimatedSecondsRemaining?: number
  discordReady?: boolean
  nearLimit?: boolean
  alreadyUnderLimit?: boolean
  maxCompressionReached?: boolean
}

export interface HistoryEntry {
  id: string
  fileName: string
  originalSize: number
  outputSize: number
  compressionRatio: number
  outputPath: string
  category: FileCategory
  mode: CompressionMode
  createdAt: number
  discordReady: boolean
}

export type MinVideoResolution = '480p' | '720p' | '1080p'

export interface AppSettings {
  // General
  launchOnStartup: boolean
  minimizeToTray: boolean
  theme: 'light' | 'dark' | 'auto'
  checkForUpdates: boolean

  // Compression
  defaultMode: CompressionMode
  targetSizeMB: number
  keepOriginals: boolean
  outputFolder: string
  overwriteBehavior: 'rename' | 'overwrite' | 'ask'
  autoFitDiscord: boolean

  // Video
  minVideoResolution: MinVideoResolution

  // Advanced
  hardwareAcceleration: boolean
  cpuUsageLimit: number
  parallelThreads: number
  backgroundProcessing: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  launchOnStartup: false,
  minimizeToTray: false,
  theme: 'auto',
  checkForUpdates: true,
  defaultMode: 'auto',
  targetSizeMB: 10,
  keepOriginals: true,
  outputFolder: '',
  overwriteBehavior: 'rename',
  autoFitDiscord: true,
  minVideoResolution: '720p',
  hardwareAcceleration: true,
  cpuUsageLimit: 80,
  parallelThreads: 2,
  backgroundProcessing: true
}

// Compress to this fraction of the user-selected target so output is always safely under the limit
export const COMPRESSION_SAFETY_FACTOR = 0.93

export const SIZE_PRESETS = {
  standard: 25,
  large: 50,
  xlarge: 500,
  image: 8
}

export type IpcChannel =
  | 'compress:start'
  | 'compress:cancel'
  | 'compress:pause'
  | 'compress:resume'
  | 'compress:progress'
  | 'compress:complete'
  | 'compress:error'
  | 'compress:queue-update'
  | 'settings:get'
  | 'settings:set'
  | 'history:get'
  | 'history:clear'
  | 'history:delete'
  | 'shell:open-file'
  | 'shell:reveal-in-explorer'
  | 'dialog:select-folder'
  | 'app:get-version'
