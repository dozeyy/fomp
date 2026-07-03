import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../store'
import { HistoryEntry } from '../../../../shared/types'
import { formatBytes, formatDate } from '../../utils/format'
import './HistoryPage.css'

const api = (window as any).api

export function HistoryPage() {
  const { history, removeHistoryEntry, setHistory } = useAppStore()
  const [search, setSearch] = useState('')

  const filtered = history.filter((e) =>
    e.fileName.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async (id: string) => {
    removeHistoryEntry(id)
    await api.deleteHistory(id)
  }

  const handleClear = async () => {
    setHistory([])
    await api.clearHistory()
  }

  const totalSaved = history.reduce((acc, e) => acc + (e.originalSize - e.outputSize), 0)

  return (
    <div className="history-page">
      <div className="history-header">
        <div>
          <h1 className="history-title">History</h1>
          {history.length > 0 && (
            <p className="history-subtitle">
              {history.length} files compressed · {formatBytes(totalSaved)} saved
            </p>
          )}
        </div>
        {history.length > 0 && (
          <button className="btn-ghost danger" onClick={handleClear}>
            Clear All
          </button>
        )}
      </div>

      {history.length > 0 && (
        <div className="history-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            type="text"
            placeholder="Search files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="history-search-input"
          />
          {search && (
            <button onClick={() => setSearch('')} className="history-search-clear">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
        </div>
      )}

      {history.length === 0 ? (
        <div className="history-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
            <polyline points="12 8 12 12 14 14" />
            <path d="M3.05 11a9 9 0 1 0 .5-4.5" />
            <polyline points="3 3 3 9 9 9" />
          </svg>
          <p className="history-empty-title">No history yet</p>
          <p className="history-empty-sub">Compressed files will appear here</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="history-empty">
          <p className="history-empty-title">No results</p>
          <p className="history-empty-sub">Try a different search term</p>
        </div>
      ) : (
        <div className="history-list">
          <AnimatePresence>
            {filtered.map((entry) => (
              <HistoryItem key={entry.id} entry={entry} onDelete={handleDelete} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

function HistoryItem({
  entry,
  onDelete
}: {
  entry: HistoryEntry
  onDelete: (id: string) => void
}) {
  return (
    <motion.div
      className="history-item"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0, padding: 0 }}
      transition={{ duration: 0.2 }}
      layout
    >
      <div className={`history-item-icon ${entry.category}`}>
        <span className="history-item-ext">
          {entry.fileName.split('.').pop()?.toUpperCase().slice(0, 4)}
        </span>
      </div>

      <div className="history-item-info">
        <p className="history-item-name truncate">{entry.fileName}</p>
        <div className="history-item-meta">
          <span>{formatDate(entry.createdAt)}</span>
          <span className="meta-dot">·</span>
          <span>{formatBytes(entry.originalSize)}</span>
          <span className="meta-arrow">→</span>
          <span>{formatBytes(entry.outputSize)}</span>
          <span className="meta-ratio">−{entry.compressionRatio.toFixed(1)}%</span>
        </div>
      </div>

      <div className="history-item-right">
        {entry.discordReady ? (
          <span className="hist-badge success">✓ Ready</span>
        ) : (
          <span className="hist-badge warning">Over</span>
        )}

        <button
          className="history-btn"
          onClick={() => api.openFile(entry.outputPath)}
          title="Open"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
        </button>
        <button
          className="history-btn"
          onClick={() => api.revealInExplorer(entry.outputPath)}
          title="Reveal in Explorer"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>
        </button>
        <button
          className="history-btn danger"
          onClick={() => onDelete(entry.id)}
          title="Delete entry"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
        </button>
      </div>
    </motion.div>
  )
}
