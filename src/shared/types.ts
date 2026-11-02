/**
 * Types shared by the main process, preload script and renderer.
 * Keep this file free of Node/Electron imports so the renderer can use it.
 */

/** Normalised severity. Numeric so it can be compared and indexed in SQLite. */
export enum Severity {
  Trace = 0,
  Debug = 1,
  Info = 2,
  Warning = 3,
  Error = 4,
  Fatal = 5,
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  [Severity.Trace]: 'TRACE',
  [Severity.Debug]: 'DEBUG',
  [Severity.Info]: 'INFO',
  [Severity.Warning]: 'WARN',
  [Severity.Error]: 'ERROR',
  [Severity.Fatal]: 'FATAL',
}

/** One logical log entry (one line, plus any continuation lines). */
export interface LogEntry {
  /** 1-based line number of the first physical line in the source file. */
  lineNo: number
  /** Epoch milliseconds (UTC) or null when the line has no timestamp. */
  ts: number | null
  /** Timestamp text exactly as it appeared in the log. */
  tsRaw: string | null
  pid: number | null
  tid: number | null
  /** LOG-MANAGER logging level (1-4) when present. */
  level: number | null
  severity: Severity
  /** e.g. 4GLTRACE, 4GLMESSAGE, DB.CONNECTS, FILEID, QRYINFO, -- */
  entryType: string | null
  /** 4GLTrace action: Run, Return, Func, Publish, Subscribe, Invoke, New, Delete, ... */
  action: string | null
  /** Thing being run / returned from (procedure, function, method, event). */
  target: string | null
  /** Remaining text after the target (parameters etc.). */
  args: string | null
  /** Procedure that was executing when the line was written (e.g. "Main Block", "proc-x"). */
  callerProc: string | null
  /** Source file of the caller (e.g. xxmain.p). */
  callerFile: string | null
  /** Line number in the caller source file. */
  callerLine: number | null
  /** Progress error number, e.g. 91 from "... (91)". */
  errorNo: number | null
  /** Human readable message (without the header). */
  message: string
  /** Full raw text (multi-line entries joined with \n). */
  raw: string
}

/** Row returned to the renderer (LogEntry + database ids). */
export interface EntryRow extends LogEntry {
  id: number
  fileId: number
}

export type FileStatus = 'queued' | 'parsing' | 'done' | 'cancelled' | 'error'

export interface FileInfo {
  id: number
  path: string
  name: string
  size: number
  parserId: string
  parserName: string
  status: FileStatus
  entries: number
  errors: number
  warnings: number
  firstTs: number | null
  lastTs: number | null
  error?: string | null
}

/** Filter for the raw log viewer. Every field is optional. */
export interface ViewFilter {
  search?: string
  regex?: boolean
  caseSensitive?: boolean
  /** Severities to include; empty / undefined = all. */
  severities?: Severity[]
  fileIds?: number[]
  pids?: number[]
  entryTypes?: string[]
  /** Substring matched against target, callerFile and callerProc. */
  program?: string
  /** Only show lines that carry a Progress error number. */
  onlyErrorNumbers?: boolean
}

export interface ViewResult {
  viewId: number
  total: number
  error?: string
}

export interface Facets {
  pids: number[]
  entryTypes: string[]
  severityCounts: Partial<Record<Severity, number>>
}

export interface IngestProgress {
  fileId: number
  fileName: string
  bytesRead: number
  totalBytes: number
  entries: number
  /** Index of this file in the current batch and the batch size. */
  index: number
  count: number
}

export interface IngestFileDone {
  file: FileInfo
}

export interface IngestComplete {
  cancelled: boolean
  files: number
  durationMs: number
}

export interface RecentItem {
  path: string
  name: string
  openedAt: number
}

/** The API exposed on window.protrace by the preload script. */
export interface ProTraceApi {
  pickFiles(): Promise<string[]>
  pickFolder(): Promise<string[]>
  getPathForFile(file: File): string
  ingest(paths: string[]): Promise<{ accepted: number; skipped: string[] }>
  cancelIngest(): Promise<void>
  newSession(): Promise<void>
  listFiles(): Promise<FileInfo[]>
  removeFile(fileId: number): Promise<void>
  applyView(filter: ViewFilter): Promise<ViewResult>
  getRows(viewId: number, start: number, end: number): Promise<EntryRow[] | null>
  getFacets(): Promise<Facets>
  getRecent(): Promise<RecentItem[]>
  clearRecent(): Promise<void>
  onIngestProgress(cb: (p: IngestProgress) => void): () => void
  onIngestFileDone(cb: (d: IngestFileDone) => void): () => void
  onIngestComplete(cb: (d: IngestComplete) => void): () => void
}
