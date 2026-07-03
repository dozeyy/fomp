import { app, BrowserWindow, shell, ipcMain, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerCompressionHandlers } from './ipc/compression'
import { registerSettingsHandlers } from './ipc/settings'
import { registerHistoryHandlers } from './ipc/history'
import { registerShellHandlers } from './ipc/shell'
import { settingsStore } from './settings/store'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const settings = settingsStore.getAll()

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: 'rgba(0,0,0,0)',
      symbolColor: '#ffffff',
      height: 40
    },
    backgroundColor: '#00000000',
    transparent: true,
    vibrancy: undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Enable Mica material on Windows 11
  if (process.platform === 'win32') {
    try {
      // @ts-ignore – available in Electron 22+
      mainWindow.setBackgroundMaterial('mica')
    } catch {
      // Fallback: acrylic or plain
      try {
        // @ts-ignore
        mainWindow.setBackgroundMaterial('acrylic')
      } catch {
        // Older Electron – just use transparent
      }
    }
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Fallback: show the window even if ready-to-show never fires
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show()
  }, 2000)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Update theme when system changes
  nativeTheme.on('updated', () => {
    mainWindow?.webContents.send('theme:updated', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.fomp.app')

  app.on('browser-window-created', (_, window) => {
    if (is.dev) {
      optimizer.watchWindowShortcuts(window)
    } else {
      // Hard-block DevTools from ever opening in the packaged app
      window.webContents.on('devtools-opened', () => {
        window.webContents.closeDevTools()
      })
    }
  })

  // IPC: window controls
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow?.close())
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)

  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('theme:get', () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light')

  registerSettingsHandlers()
  registerHistoryHandlers()
  registerCompressionHandlers(() => mainWindow)
  registerShellHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
