import { ipcMain, app } from 'electron'
import { settingsStore } from '../settings/store'
import { AppSettings } from '../../shared/types'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => settingsStore.getAll())

  ipcMain.handle('settings:set', (_, updates: Partial<AppSettings>) => {
    settingsStore.setMany(updates)

    // Handle startup setting
    if ('launchOnStartup' in updates) {
      app.setLoginItemSettings({ openAtLogin: updates.launchOnStartup! })
    }

    return settingsStore.getAll()
  })

  ipcMain.handle('settings:reset', () => {
    settingsStore.reset()
    return settingsStore.getAll()
  })
}
