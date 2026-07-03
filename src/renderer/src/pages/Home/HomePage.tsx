import { useCallback, useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../store'
import { JobCard } from '../../components/JobCard/JobCard'
import { AppIcon } from '../../components/AppIcon'
import { CompressionMode } from '../../../../shared/types'
import './HomePage.css'

const api = (window as any).api

const PRESETS = [10, 25, 50] as const

export function HomePage() {
  const { jobs, settings, setSettings, clearCompleted } = useAppStore()
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const [customInput, setCustomInput] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const customRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  const targetMB = settings.targetSizeMB

  const setTarget = useCallback(async (mb: number) => {
    const clamped = Math.max(1, Math.min(500, mb))
    const updated = { ...settings, targetSizeMB: clamped }
    setSettings(updated)
    try {
      await api.setSettings({ targetSizeMB: clamped })
    } catch {
      // non-fatal
    }
  }, [settings, setSettings])

  const handlePreset = (mb: number) => {
    setShowCustom(false)
    setCustomInput('')
    setTarget(mb)
  }

  const handleCustomClick = () => {
    setShowCustom(true)
    setCustomInput(String(targetMB))
    setTimeout(() => customRef.current?.select(), 30)
  }

  const handleCustomCommit = () => {
    const v = parseFloat(customInput)
    if (!isNaN(v) && v > 0) setTarget(v)
    setShowCustom(false)
  }

  const jobList = [...jobs.values()].reverse()
  const hasJobs = jobList.length > 0
  const activeJobs = jobList.filter((j) => j.status === 'processing' || j.status === 'queued')
  const completedJobs = jobList.filter((j) => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled')

  useEffect(() => {
    if (!dropError) return
    const t = setTimeout(() => setDropError(null), 4000)
    return () => clearTimeout(t)
  }, [dropError])

  const processFiles = useCallback(async (files: string[]) => {
    if (!files.length) {
      setDropError('No valid file paths found. Try using the Browse button instead.')
      return
    }
    setIsProcessing(true)
    try {
      await api.compressFiles(
        files,
        settings.defaultMode as CompressionMode,
        targetMB
      )
    } catch (err: unknown) {
      setDropError(err instanceof Error ? err.message : 'Failed to start compression')
    } finally {
      setIsProcessing(false)
    }
  }, [settings, targetMB])

  const handleBrowse = useCallback(async () => {
    try {
      const files: string[] = await api.selectFiles()
      processFiles(files)
    } catch (err: unknown) {
      setDropError(err instanceof Error ? err.message : 'Failed to open file dialog')
    }
  }, [processFiles])

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.items.length > 0) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      dragCounter.current = 0

      const files = [...e.dataTransfer.files]
        .map((f) => (f as any).path as string)
        .filter(Boolean)
      processFiles(files)
    },
    [processFiles]
  )

  return (
    <div className="home-page">
      {/* Drop Zone */}
      {dropError && (
        <div className="drop-error">{dropError}</div>
      )}

      {/* Target Size Selector */}
      <div className="target-bar">
        <span className="target-label">Target size</span>
        <div className="target-presets">
          {PRESETS.map((mb) => (
            <button
              key={mb}
              className={`target-chip ${!showCustom && targetMB === mb ? 'active' : ''}`}
              onClick={() => handlePreset(mb)}
            >
              {mb} MB
            </button>
          ))}
          {showCustom ? (
            <span className="target-custom-wrap">
              <input
                ref={customRef}
                className="target-custom-input"
                type="number"
                min={1}
                max={500}
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onBlur={handleCustomCommit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCustomCommit()
                  if (e.key === 'Escape') { setShowCustom(false); setCustomInput('') }
                }}
              />
              <span className="target-custom-unit">MB</span>
            </span>
          ) : (
            <button
              className={`target-chip ${!PRESETS.includes(targetMB as any) ? 'active' : ''}`}
              onClick={handleCustomClick}
            >
              {!PRESETS.includes(targetMB as any) ? `${targetMB} MB` : 'Custom'}
            </button>
          )}
        </div>
      </div>

      <motion.div
        className={`drop-zone ${isDragging ? 'dragging' : ''} ${hasJobs ? 'compact' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleBrowse}
        animate={{
          borderColor: isDragging ? 'var(--accent)' : 'var(--border-strong)',
          backgroundColor: isDragging ? 'var(--accent-subtle)' : 'var(--surface)'
        }}
        transition={{ duration: 0.15 }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleBrowse()}
        aria-label="Drop files here or click to browse"
      >

        <AnimatePresence mode="wait">
          {isDragging ? (
            <motion.div
              key="dragging"
              className="drop-zone-content"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <div className="drop-zone-icon accent">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                  <path d="M20 21H4a2 2 0 01-2-2v-1" />
                </svg>
              </div>
              <p className="drop-zone-title accent">Drop to compress</p>
            </motion.div>
          ) : hasJobs ? (
            <motion.div
              key="compact"
              className="drop-zone-content compact"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="drop-zone-icon small">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <p className="drop-zone-hint">Drop more files or click to browse</p>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              className="drop-zone-content"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              <div className="drop-zone-app-icon">
                <AppIcon size={56} />
              </div>
              <h1 className="drop-zone-title">Fomp</h1>
              <p className="drop-zone-subtitle">
                Drop any file to compress it to your target size
              </p>
              <div className="drop-zone-filetypes">
                <span>Images</span>
                <span>Videos</span>
                <span>Audio</span>
                <span>Documents</span>
                <span>Archives</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Active Jobs */}
      <AnimatePresence>
        {activeJobs.length > 0 && (
          <motion.section
            className="jobs-section"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <h2 className="section-title">Processing</h2>
            <div className="jobs-list">
              {activeJobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Completed Jobs */}
      <AnimatePresence>
        {completedJobs.length > 0 && (
          <motion.section
            className="jobs-section"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="section-header">
              <h2 className="section-title">Completed</h2>
              <button className="section-action" onClick={clearCompleted}>Clear</button>
            </div>
            <div className="jobs-list">
              {completedJobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}
