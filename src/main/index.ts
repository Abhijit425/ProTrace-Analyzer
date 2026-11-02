/**
 * Electron main process: window, session database, IPC handlers.
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import type { ViewFilter } from '@shared/types'
import { openDb, SessionStore, type DB } from './db/database'
import { scanPaths } from './ingest/fileScanner'
import { IngestManager } from './ingest/ingestManager'
import { RecentList } from './recent'
import createParseWorker from './ingest/parseWorker?nodeWorker'

let win: BrowserWindow | null = null
let db: DB
let store: SessionStore
let ingest: IngestManager
let recent: RecentList
let dbPath: string

/** Each launch (and "New analysis") starts from an empty session database. */
function openSession(): void {
  const dir = join(app.getPath('userData'), 'session')
  mkdirSync(dir, { recursive: true })
  dbPath = join(dir, 'current.sqlite')
  for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true })
  db = openDb(dbPath)
  store = new SessionStore(db)
  ingest = new IngestManager(store, dbPath, createParseWorker, {
    progress: (p) => win?.webContents.send(IPC.ingestProgress, p),
    fileDone: (d) => win?.webContents.send(IPC.ingestFileDone, d),
    complete: (d) => win?.webContents.send(IPC.ingestComplete, d),
  })
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b0f17',
    title: 'ProTrace Analyzer',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  win.once('ready-to-show', () => win?.show())
  // Open external links in the browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  win.on('closed', () => (win = null))
}

function registerIpc(): void {
  ipcMain.handle(IPC.pickFiles, async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Open log files',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Log files', extensions: ['log', 'lg', 'txt', 'out', '*'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    return r.canceled ? [] : r.filePaths
  })

  ipcMain.handle(IPC.pickFolder, async () => {
    const r = await dialog.showOpenDialog(win!, { title: 'Open log folder', properties: ['openDirectory'] })
    return r.canceled ? [] : r.filePaths
  })

  ipcMain.handle(IPC.ingest, async (_e, paths: string[]) => {
    const { files, skipped } = await scanPaths(paths)
    if (files.length) {
      ingest.enqueue(files)
      await recent.add(paths)
    }
    return { accepted: files.length, skipped }
  })

  ipcMain.handle(IPC.cancelIngest, () => ingest.cancel())

  ipcMain.handle(IPC.newSession, () => {
    if (ingest.busy) throw new Error('Cancel the running import first')
    db.close()
    openSession()
  })

  ipcMain.handle(IPC.listFiles, () => store.listFiles())
  ipcMain.handle(IPC.removeFile, (_e, id: number) => store.removeFile(id))
  ipcMain.handle(IPC.applyView, (_e, f: ViewFilter) => store.applyView(f))
  ipcMain.handle(IPC.getRows, (_e, viewId: number, start: number, end: number) => store.getRows(viewId, start, end))
  ipcMain.handle(IPC.getFacets, () => store.getFacets())
  ipcMain.handle(IPC.getRecent, () => recent.get())
  ipcMain.handle(IPC.clearRecent, () => recent.clear())
}

app.whenReady().then(() => {
  recent = new RecentList(app.getPath('userData'))
  openSession()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (ingest?.busy) ingest.cancel()
  db?.close()
  if (process.platform !== 'darwin') app.quit()
})
