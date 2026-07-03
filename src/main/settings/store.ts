import Store from 'electron-store'
import { AppSettings, DEFAULT_SETTINGS } from '../../shared/types'

const store = new Store<AppSettings>({
  name: 'settings',
  defaults: DEFAULT_SETTINGS
})

export const settingsStore = {
  getAll(): AppSettings {
    return store.store
  },
  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return store.get(key)
  },
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    store.set(key, value)
  },
  setMany(updates: Partial<AppSettings>): void {
    for (const [key, value] of Object.entries(updates)) {
      store.set(key as keyof AppSettings, value as AppSettings[keyof AppSettings])
    }
  },
  reset(): void {
    store.clear()
  }
}
