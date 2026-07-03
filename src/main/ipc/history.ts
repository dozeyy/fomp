import { ipcMain } from 'electron'
import { historyStore } from '../history/store'

export function registerHistoryHandlers(): void {
  ipcMain.handle('history:get', () => historyStore.getAll())

  ipcMain.handle('history:delete', (_, id: string) => {
    historyStore.delete(id)
    return historyStore.getAll()
  })

  ipcMain.handle('history:clear', () => {
    historyStore.clear()
    return []
  })
}
