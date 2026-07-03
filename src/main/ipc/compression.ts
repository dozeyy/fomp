import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { createCompressionEngine } from '../compression/engine'
import { CompressionMode } from '../../shared/types'

let engine: ReturnType<typeof createCompressionEngine> | null = null

export function registerCompressionHandlers(getWindow: () => BrowserWindow | null): void {
  engine = createCompressionEngine(getWindow)

  ipcMain.handle(
    'compress:start',
    async (_, { filePaths, mode, targetSizeMB }: { filePaths: string[]; mode?: CompressionMode; targetSizeMB?: number }) => {
      const ids: string[] = []
      for (const fp of filePaths) {
        try {
          const id = await engine!.enqueue(fp, mode, targetSizeMB)
          ids.push(id)
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          ids.push(`error:${msg}`)
        }
      }
      return ids
    }
  )

  ipcMain.on('compress:cancel', (_, id: string) => {
    engine?.cancel(id)
  })

  ipcMain.on('compress:cancel-all', () => {
    engine?.cancelAll()
  })
}
