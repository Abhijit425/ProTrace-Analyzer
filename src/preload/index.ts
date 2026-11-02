/**
 * Preload: exposes a small, typed API on window.protrace.
 * The renderer never gets direct access to Node or ipcRenderer.
 */
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { ProTraceApi } from '@shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: ProTraceApi = {
  pickFiles: () => ipcRenderer.invoke(IPC.pickFiles),
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder),
  // File.path was removed in Electron 32; webUtils is the supported way to get a dropped file's path.
  getPathForFile: (file) => webUtils.getPathForFile(file),
  ingest: (paths) => ipcRenderer.invoke(IPC.ingest, paths),
  cancelIngest: () => ipcRenderer.invoke(IPC.cancelIngest),
  newSession: () => ipcRenderer.invoke(IPC.newSession),
  listFiles: () => ipcRenderer.invoke(IPC.listFiles),
  removeFile: (id) => ipcRenderer.invoke(IPC.removeFile, id),
  applyView: (filter) => ipcRenderer.invoke(IPC.applyView, filter),
  getRows: (viewId, start, end) => ipcRenderer.invoke(IPC.getRows, viewId, start, end),
  getFacets: () => ipcRenderer.invoke(IPC.getFacets),
  getRecent: () => ipcRenderer.invoke(IPC.getRecent),
  clearRecent: () => ipcRenderer.invoke(IPC.clearRecent),
  onIngestProgress: (cb) => subscribe(IPC.ingestProgress, cb),
  onIngestFileDone: (cb) => subscribe(IPC.ingestFileDone, cb),
  onIngestComplete: (cb) => subscribe(IPC.ingestComplete, cb),
}

contextBridge.exposeInMainWorld('protrace', api)
