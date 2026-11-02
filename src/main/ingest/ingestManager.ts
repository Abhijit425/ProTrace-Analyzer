/**
 * Queues files and parses them one at a time in a worker thread.
 * One file at a time keeps SQLite to a single writer and memory flat.
 */
import type { Worker, WorkerOptions } from 'node:worker_threads'
import { basename } from 'node:path'
import type { IngestComplete, IngestFileDone, IngestProgress } from '@shared/types'
import type { SessionStore } from '../db/database'
import type { WorkerInput, WorkerMessage } from './messages'

export interface IngestEvents {
  progress(p: IngestProgress): void
  fileDone(d: IngestFileDone): void
  complete(d: IngestComplete): void
}

interface QueueItem {
  fileId: number
  path: string
  name: string
  size: number
}

export class IngestManager {
  private queue: QueueItem[] = []
  private current: { worker: Worker; item: QueueItem } | null = null
  private cancelled = false
  private batchCount = 0
  private batchIndex = 0
  private batchStart = 0

  constructor(
    private store: SessionStore,
    private dbPath: string,
    private createWorker: (opts: WorkerOptions) => Worker,
    private events: IngestEvents,
  ) {}

  get busy(): boolean {
    return this.current !== null || this.queue.length > 0
  }

  /** Register files in the session and queue them for parsing. */
  enqueue(files: Array<{ path: string; size: number }>): number {
    if (!this.busy) {
      this.batchCount = 0
      this.batchIndex = 0
      this.batchStart = Date.now()
      this.cancelled = false
    }
    for (const f of files) {
      const name = basename(f.path)
      const fileId = this.store.addFile(f.path, name, f.size)
      this.queue.push({ fileId, path: f.path, name, size: f.size })
      this.batchCount++
    }
    if (!this.current) this.next()
    return files.length
  }

  /** Stop the current file and drop everything still queued. */
  cancel(): void {
    this.cancelled = true
    for (const q of this.queue) this.store.removeFile(q.fileId)
    this.queue = []
    this.current?.worker.postMessage({ type: 'cancel' })
  }

  private next(): void {
    const item = this.queue.shift()
    if (!item) {
      this.current = null
      this.events.complete({ cancelled: this.cancelled, files: this.batchCount, durationMs: Date.now() - this.batchStart })
      return
    }
    this.batchIndex++
    this.store.updateFile(item.fileId, { status: 'parsing' })

    const data: WorkerInput = { dbPath: this.dbPath, fileId: item.fileId, path: item.path, name: item.name }
    const worker = this.createWorker({ workerData: data })
    this.current = { worker, item }
    let finished = false

    const finish = () => {
      if (finished) return
      finished = true
      void worker.terminate()
      this.current = null
      this.next()
    }

    worker.on('message', (m: WorkerMessage) => {
      switch (m.type) {
        case 'detected':
          this.store.updateFile(item.fileId, { parserId: m.parserId, parserName: m.parserName })
          break
        case 'progress':
          this.events.progress({
            fileId: item.fileId,
            fileName: item.name,
            bytesRead: m.bytesRead,
            totalBytes: item.size,
            entries: m.entries,
            index: this.batchIndex,
            count: this.batchCount,
          })
          break
        case 'done':
          this.store.updateFile(item.fileId, { status: 'done', ...m.stats, facets: m.facets })
          this.events.fileDone({ file: this.store.getFile(item.fileId)! })
          finish()
          break
        case 'cancelled':
          this.store.removeFile(item.fileId)
          finish()
          break
        case 'error':
          this.store.updateFile(item.fileId, { status: 'error', error: m.message })
          this.events.fileDone({ file: this.store.getFile(item.fileId)! })
          finish()
          break
      }
    })
    worker.on('error', (err) => {
      this.store.updateFile(item.fileId, { status: 'error', error: err.message })
      this.events.fileDone({ file: this.store.getFile(item.fileId)! })
      finish()
    })
    worker.on('exit', () => {
      if (!finished) {
        this.store.updateFile(item.fileId, { status: 'error', error: 'Parser worker exited unexpectedly' })
        finish()
      }
    })
  }
}
