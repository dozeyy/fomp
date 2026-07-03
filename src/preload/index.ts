import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Compression
  compressFiles: (filePaths: string[], mode?: string, targetSizeMB?: number) =>
    ipcRenderer.invoke('compress:start', { filePaths, mode, targetSizeMB }),
  cancelCompression: (id: string) => ipcRenderer.send('compress:cancel', id),
  cancelAll: () => ipcRenderer.send('compress:cancel-all'),

  // Events
  onQueueUpdate: (cb: (job: unknown) => void) => {
    ipcRenderer.on('compress:queue-update', (_, job) => cb(job))
    return () => ipcRenderer.removeAllListeners('compress:queue-update')
  },
  onProgress: (cb: (data: { id: string; stage: string; progress: number }) => void) => {
    ipcRenderer.on('compress:progress', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('compress:progress')
  },
  onComplete: (cb: (job: unknown) => void) => {
    ipcRenderer.on('compress:complete', (_, job) => cb(job))
    return () => ipcRenderer.removeAllListeners('compress:complete')
  },
  onError: (cb: (data: { id: string; error: string }) => void) => {
    ipcRenderer.on('compress:error', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('compress:error')
  },
  onThemeUpdate: (cb: (theme: string) => void) => {
    ipcRenderer.on('theme:updated', (_, theme) => cb(theme))
    return () => ipcRenderer.removeAllListeners('theme:updated')
  },

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (updates: Record<string, unknown>) => ipcRenderer.invoke('settings:set', updates),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),

  // History
  getHistory: () => ipcRenderer.invoke('history:get'),
  deleteHistory: (id: string) => ipcRenderer.invoke('history:delete', id),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  // Shell
  openFile: (path: string) => ipcRenderer.invoke('shell:open-file', path),
  revealInExplorer: (path: string) => ipcRenderer.invoke('shell:reveal-in-explorer', path),
  saveFile: (sourcePath: string, suggestedName: string): Promise<string | null> =>
    ipcRenderer.invoke('shell:save-file', { sourcePath, suggestedName }),
  selectFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:select-files'),
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),

  // Window
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),

  // App
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getTheme: () => ipcRenderer.invoke('theme:get')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
