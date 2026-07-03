import { useState } from 'react'
import { motion } from 'framer-motion'
import { CompressionJob } from '../../../../shared/types'
import { formatBytes } from '../../utils/format'
import { useAppStore } from '../../store'
import './JobCard.css'

const api = (window as any).api

interface Props {
  job: CompressionJob
}

const STAGE_LABELS: Record<string, string> = {
  detecting: 'Detecting format…',
  encoding: 'Encoding…',
  resizing: 'Resizing…',
  optimizing: 'Optimizing…',
  finalizing: 'Finalizing…'
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  image: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  video: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  ),
  audio: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  ),
  document: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  archive: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  )
}

export function JobCard({ job }: Props) {
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const addDownload = useAppStore((s) => s.addDownload)
  const removeJob = useAppStore((s) => s.removeJob)

  const isActive = job.status === 'processing' || job.status === 'queued'
  const isComplete = job.status === 'completed'
  const isFailed = job.status === 'failed'
  const isCancelled = job.status === 'cancelled'

  const handleDownload = async () => {
    if (!job.outputPath) return
    setSaving(true)
    try {
      const dest: string | null = await api.saveFile(job.outputPath, job.fileName)
      if (dest) {
        setSavedPath(dest)
        addDownload({
          id: job.id,
          fileName: job.fileName,
          savedPath: dest,
          outputSize: job.outputSize ?? 0,
          originalSize: job.originalSize,
          savedAt: Date.now()
        })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      className={`job-card ${job.status}`}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      layout
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {/* Left: icon + info */}
      <div className="job-left">
        <div className={`job-icon ${job.category}`}>
          {CATEGORY_ICONS[job.category] ?? CATEGORY_ICONS.document}
        </div>
        <div className="job-info">
          <p className="job-name truncate">{job.fileName}</p>

          {isActive && (
            <p className="job-stage">
              {job.status === 'queued' ? 'Waiting in queue…' : (STAGE_LABELS[job.stage ?? ''] ?? 'Processing…')}
            </p>
          )}

          {isComplete && (
            <div className="job-stats">
              {job.alreadyUnderLimit ? (
                <span className="stat-already-under">
                  {formatBytes(job.originalSize)} — already under the {job.targetSizeMB} MB target, no compression needed
                </span>
              ) : (
                <>
                  <span className="stat-original">{formatBytes(job.originalSize)}</span>
                  <span className="stat-arrow">→</span>
                  <span className="stat-output">{formatBytes(job.outputSize!)}</span>
                  {(job.compressionRatio ?? 0) >= 0.5 ? (
                    <span className="stat-ratio">−{job.compressionRatio?.toFixed(1)}%</span>
                  ) : (
                    <span className="stat-ratio at-limit">already compressed</span>
                  )}
                </>
              )}
            </div>
          )}

          {isFailed && (
            <p className="job-error">{job.error ?? 'Compression failed'}</p>
          )}

          {isCancelled && (
            <p className="job-stage">Cancelled</p>
          )}
        </div>
      </div>

      {/* Right: status + actions */}
      <div className="job-right">
        {isActive && (
          <button
            className="job-btn cancel"
            onClick={() => { api.cancelCompression(job.id); removeJob(job.id) }}
            title="Cancel"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}

        {isComplete && (
          <div className="job-complete-actions">
            {job.alreadyUnderLimit ? (
              <span className="badge success">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                Under Limit
              </span>
            ) : job.discordReady ? (
              <span className="badge success">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                Target Ready
              </span>
            ) : job.maxCompressionReached ? (
              <span className="badge neutral" title="This file has been compressed as much as possible — it cannot reach the target size">Max Compressed</span>
            ) : (job.compressionRatio ?? 0) < 0.5 ? (
              <span className="badge neutral" title="This file format is already compressed — it can't be shrunk further">Max Compressed</span>
            ) : (
              <span className="badge warning">Over Limit</span>
            )}

            {job.alreadyUnderLimit ? (
              <button
                className="job-btn"
                onClick={() => api.revealInExplorer(job.filePath)}
                title="Show original in Explorer"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>
              </button>
            ) : savedPath ? (
              <button
                className="job-btn"
                onClick={() => api.revealInExplorer(savedPath)}
                title="Reveal in Explorer"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>
              </button>
            ) : (
              <button
                className="job-btn download"
                onClick={handleDownload}
                disabled={saving}
                title="Download compressed file"
              >
                {saving ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                )}
                {saving ? 'Saving…' : 'Download'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {isActive && (
        <div className="job-progress-track">
          <motion.div
            className="job-progress-fill"
            initial={{ width: 0 }}
            animate={{ width: `${job.progress}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      )}
    </motion.div>
  )
}
