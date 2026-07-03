import { create } from 'zustand'
import { CompressionJob, HistoryEntry, AppSettings, DEFAULT_SETTINGS } from '../../../shared/types'

type Page = 'home' | 'history' | 'settings'

export interface DownloadRecord {
  id: string
  fileName: string
  savedPath: string
  outputSize: number
  originalSize: number
  savedAt: number
}

interface AppStore {
  // Navigation
  page: Page
  setPage: (page: Page) => void

  // Theme
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void

  // Settings
  settings: AppSettings
  setSettings: (settings: AppSettings) => void
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void

  // Compression queue
  jobs: Map<string, CompressionJob>
  addJob: (job: CompressionJob) => void
  updateJob: (id: string, updates: Partial<CompressionJob>) => void
  removeJob: (id: string) => void
  clearCompleted: () => void

  // History
  history: HistoryEntry[]
  setHistory: (entries: HistoryEntry[]) => void
  addHistoryEntry: (entry: HistoryEntry) => void
  removeHistoryEntry: (id: string) => void

  // Downloads panel
  downloads: DownloadRecord[]
  downloadPanelOpen: boolean
  addDownload: (d: DownloadRecord) => void
  removeDownload: (id: string) => void
  clearDownloads: () => void
  setDownloadPanelOpen: (open: boolean) => void
}

export const useAppStore = create<AppStore>((set) => ({
  page: 'home',
  setPage: (page) => set({ page }),

  theme: 'dark',
  setTheme: (theme) => set({ theme }),

  settings: DEFAULT_SETTINGS,
  setSettings: (settings) => set({ settings }),
  updateSetting: (key, value) =>
    set((state) => ({ settings: { ...state.settings, [key]: value } })),

  jobs: new Map(),
  addJob: (job) =>
    set((state) => {
      const jobs = new Map(state.jobs)
      jobs.set(job.id, job)
      return { jobs }
    }),
  updateJob: (id, updates) =>
    set((state) => {
      const jobs = new Map(state.jobs)
      const existing = jobs.get(id)
      if (existing) jobs.set(id, { ...existing, ...updates })
      return { jobs }
    }),
  removeJob: (id) =>
    set((state) => {
      const jobs = new Map(state.jobs)
      jobs.delete(id)
      return { jobs }
    }),
  clearCompleted: () =>
    set((state) => {
      const jobs = new Map(state.jobs)
      for (const [id, job] of jobs) {
        if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
          jobs.delete(id)
        }
      }
      return { jobs }
    }),

  history: [],
  setHistory: (history) => set({ history }),
  addHistoryEntry: (entry) =>
    set((state) => ({ history: [entry, ...state.history] })),
  removeHistoryEntry: (id) =>
    set((state) => ({ history: state.history.filter((e) => e.id !== id) })),

  downloads: [],
  downloadPanelOpen: false,
  addDownload: (d) =>
    set((state) => ({ downloads: [d, ...state.downloads], downloadPanelOpen: true })),
  removeDownload: (id) =>
    set((state) => ({ downloads: state.downloads.filter((d) => d.id !== id) })),
  clearDownloads: () => set({ downloads: [], downloadPanelOpen: false }),
  setDownloadPanelOpen: (open) => set({ downloadPanelOpen: open })
}))
