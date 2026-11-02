import type { FileFacets, FileStats } from '../db/database'

/** Data handed to each parse worker. */
export interface WorkerInput {
  dbPath: string
  fileId: number
  path: string
  name: string
}

/** Messages the worker posts back to the main process. */
export type WorkerMessage =
  | { type: 'detected'; parserId: string; parserName: string; score: number }
  | { type: 'progress'; bytesRead: number; entries: number }
  | { type: 'done'; stats: FileStats; facets: FileFacets }
  | { type: 'cancelled' }
  | { type: 'error'; message: string }

/** Messages the main process sends to the worker. */
export type HostMessage = { type: 'cancel' }
