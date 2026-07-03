import { ipcMain, shell, dialog } from 'electron'
import { copyFile } from 'fs/promises'
import { basename } from 'path'

export function registerShellHandlers(): void {
  ipcMain.handle('shell:open-file', (_, filePath: string) => {
    return shell.openPath(filePath)
  })

  ipcMain.handle('shell:reveal-in-explorer', (_, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('shell:save-file', async (_, { sourcePath, suggestedName }: { sourcePath: string; suggestedName: string }) => {
    const { app } = await import('electron')
    const { existsSync } = await import('fs')
    const { extname: ext, join: pjoin, basename: pbase } = await import('path')

    const downloadsDir = app.getPath('downloads')
    const name = suggestedName || pbase(sourcePath)
    const extension = ext(name)
    const stem = pbase(name, extension)

    // Find a unique filename in Downloads
    let destPath = pjoin(downloadsDir, name)
    let counter = 1
    while (existsSync(destPath)) {
      destPath = pjoin(downloadsDir, `${stem} (${counter})${extension}`)
      counter++
    }

    await copyFile(sourcePath, destPath)
    return destPath
  })

  ipcMain.handle('dialog:select-files', async (event) => {
    const { BrowserWindow } = await import('electron')
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Supported Files',
          extensions: [
            'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'avif',
            'mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'm4v',
            'mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac', 'wma',
            'pdf', 'docx', 'doc', 'pptx', 'ppt',
            'zip', 'rar', '7z', 'tar', 'gz'
          ]
        },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('dialog:select-folder', async (event) => {
    const { BrowserWindow } = await import('electron')
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })
}
