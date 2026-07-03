import Store from 'electron-store'
import { HistoryEntry } from '../../shared/types'

interface HistoryData {
  entries: HistoryEntry[]
}

const store = new Store<HistoryData>({
  name: 'history',
  defaults: { entries: [] }
})

const MAX_HISTORY = 500

export const historyStore = {
  getAll(): HistoryEntry[] {
    return store.get('entries', [])
  },

  add(entry: HistoryEntry): void {
    const entries = store.get('entries', [])
    entries.unshift(entry)
    if (entries.length > MAX_HISTORY) entries.length = MAX_HISTORY
    store.set('entries', entries)
  },

  delete(id: string): void {
    const entries = store.get('entries', []).filter((e) => e.id !== id)
    store.set('entries', entries)
  },

  clear(): void {
    store.set('entries', [])
  }
}
