import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from './store'
import { TitleBar } from './components/TitleBar/TitleBar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { HomePage } from './pages/Home/HomePage'
import { HistoryPage } from './pages/History/HistoryPage'
import { SettingsPage } from './pages/Settings/SettingsPage'
import { CompressionJob, HistoryEntry, AppSettings } from '../../shared/types'
import './styles/app.css'

const api = (window as any).api

export default function App() {
  const { page, theme, setTheme, setSettings, addJob, updateJob, removeJob, setHistory } = useAppStore()

  // Bootstrap
  useEffect(() => {
    async function init() {
      // Load settings
      const settings: AppSettings = await api.getSettings()
      setSettings(settings)

      // Resolve theme
      const sysTheme = await api.getTheme()
      const resolved = settings.theme === 'auto' ? sysTheme : settings.theme
      setTheme(resolved as 'light' | 'dark')

      // Load history
      const history: HistoryEntry[] = await api.getHistory()
      setHistory(history)
    }
    init()
  }, [])

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // System theme changes
  useEffect(() => {
    const off = api.onThemeUpdate((t: string) => {
      const { settings } = useAppStore.getState()
      if (settings.theme === 'auto') setTheme(t as 'light' | 'dark')
    })
    return off
  }, [])

  // IPC: compression events
  useEffect(() => {
    const offQueue = api.onQueueUpdate((job: CompressionJob) => {
      if (job.status === 'cancelled') {
        removeJob(job.id)
      } else {
        addJob(job)
      }
    })

    const offProgress = api.onProgress(({ id, stage, progress }: { id: string; stage: string; progress: number }) => {
      updateJob(id, { stage: stage as any, progress, status: 'processing' })
    })

    const offComplete = api.onComplete((job: CompressionJob) => {
      // Use addJob (upsert) instead of updateJob so that jobs which arrive as
      // already-under-limit — where compress:queue-update is never emitted —
      // still appear as a card.
      addJob(job)
    })

    const offError = api.onError(({ id, error }: { id: string; error: string }) => {
      updateJob(id, { status: 'failed', error })
    })

    return () => {
      offQueue()
      offProgress()
      offComplete()
      offError()
    }
  }, [])

  const pages: Record<string, React.ReactNode> = {
    home: <HomePage />,
    history: <HistoryPage />,
    settings: <SettingsPage />
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className="app-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              className="page-wrapper"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {pages[page]}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
