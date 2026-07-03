import { useState, useEffect, useRef } from 'react'
import { AppIcon } from '../AppIcon'
import { useAppStore } from '../../store'
import { formatBytes } from '../../utils/format'
import './TitleBar.css'

const api = (window as any).api

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const { downloads, downloadPanelOpen, removeDownload, clearDownloads, setDownloadPanelOpen } = useAppStore()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.isMaximized().then(setIsMaximized)
  }, [])

  // Close panel when clicking outside
  useEffect(() => {
    if (!downloadPanelOpen) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setDownloadPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [downloadPanelOpen])

  return (
    <div className="titlebar">
      <div className="titlebar-drag-region" />

      <div className="titlebar-left">
        <AppIcon size={16} />
        <span className="titlebar-title">Fomp</span>
      </div>

      <div className="titlebar-controls">
        {/* Download panel trigger */}
        {downloads.length > 0 && (
          <div className="dl-wrap" ref={panelRef}>
            <button
              className={`titlebar-btn dl-btn ${downloadPanelOpen ? 'active' : ''}`}
              onClick={() => setDownloadPanelOpen(!downloadPanelOpen)}
              title="Downloads"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span className="dl-count">{downloads.length}</span>
            </button>

            {downloadPanelOpen && (
              <div className="dl-panel">
                <div className="dl-panel-header">
                  <span>Downloads</span>
                  <button className="dl-clear" onClick={clearDownloads}>Clear all</button>
                </div>
                <div className="dl-list">
                  {downloads.map((d) => (
                    <div key={d.id} className="dl-item">
                      <div className="dl-item-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                      </div>
                      <div className="dl-item-info">
                        <p className="dl-item-name truncate">{d.fileName}</p>
                        <p className="dl-item-meta">{formatBytes(d.originalSize)} → {formatBytes(d.outputSize)}</p>
                      </div>
                      <div className="dl-item-actions">
                        <button
                          className="dl-action"
                          onClick={() => api.revealInExplorer(d.savedPath)}
                          title="Show in folder"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                        </button>
                        <button
                          className="dl-action dismiss"
                          onClick={() => removeDownload(d.id)}
                          title="Dismiss"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Window controls */}
        <button className="titlebar-btn" onClick={() => api.minimizeWindow()} title="Minimize">
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor" /></svg>
        </button>
        <button
          className="titlebar-btn"
          onClick={() => { api.maximizeWindow(); setIsMaximized(!isMaximized) }}
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M3 0v1H1v8h8V7h1V0H3zm0 1h5v5H7V3H3V1zm-2 2h4v4H1V3z" fill="currentColor" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" /></svg>
          )}
        </button>
        <button className="titlebar-btn close-btn" onClick={() => api.closeWindow()} title="Close">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.2"/></svg>
        </button>
      </div>
    </div>
  )
}
