/**
 * SQLite storage for a single analysis session.
 *
 * The worker thread writes entries (EntryWriter); the main process reads
 * them (SessionStore). WAL mode lets both connections work at once.
 *
 * The raw viewer pages through a "materialised view": when the filter
 * changes we copy the matching entry ids into a TEMP table with a dense
 * sequence number. Any scroll position is then a cheap primary-key range
 * lookup, even with 10M+ rows.
 */
import Database from 'better-sqlite3'
import type { EntryRow, Facets, FileInfo, FileStatus, LogEntry, ViewFilter, ViewResult } from '@shared/types'
import { Severity } from '@shared/types'

export type DB = Database.Database

export function openDb(path: string): DB {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = OFF') // session cache, rebuilt from the logs if lost
  db.pragma('temp_store = MEMORY')
  db.pragma('cache_size = -65536') // 64 MB
  db.pragma('busy_timeout = 15000')
  initSchema(db)
  return db
}

export function initSchema(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id          INTEGER PRIMARY KEY,
      path        TEXT NOT NULL,
      name        TEXT NOT NULL,
      size        INTEGER NOT NULL,
      parser_id   TEXT NOT NULL DEFAULT '',
      parser_name TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'queued',
      entries     INTEGER NOT NULL DEFAULT 0,
      errors      INTEGER NOT NULL DEFAULT 0,
      warnings    INTEGER NOT NULL DEFAULT 0,
      first_ts    INTEGER,
      last_ts     INTEGER,
      error       TEXT,
      facets      TEXT        -- JSON FileFacets, computed by the worker while parsing
    );
    CREATE TABLE IF NOT EXISTS entries (
      id          INTEGER PRIMARY KEY,
      file_id     INTEGER NOT NULL,
      line_no     INTEGER NOT NULL,
      ts          INTEGER,
      ts_raw      TEXT,
      pid         INTEGER,
      tid         INTEGER,
      level       INTEGER,
      severity    INTEGER NOT NULL,
      entry_type  TEXT,
      action      TEXT,
      target      TEXT,
      args        TEXT,
      caller_proc TEXT,
      caller_file TEXT,
      caller_line INTEGER,
      error_no    INTEGER,
      message     TEXT NOT NULL,
      raw         TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_entries_file     ON entries(file_id);
    CREATE INDEX IF NOT EXISTS ix_entries_severity ON entries(severity);
    CREATE INDEX IF NOT EXISTS ix_entries_errno    ON entries(error_no) WHERE error_no IS NOT NULL;
  `)
}

/* ------------------------------------------------------------------ */
/* Writer (used inside the parse worker)                               */
/* ------------------------------------------------------------------ */

export interface FileStats {
  entries: number
  errors: number
  warnings: number
  firstTs: number | null
  lastTs: number | null
}

/** Distinct values collected while parsing, so the UI never has to scan the entries table for them. */
export interface FileFacets {
  pids: number[]
  entryTypes: string[]
  severityCounts: Record<number, number>
}

const MAX_FACET_VALUES = 500

export class EntryWriter {
  private insert: Database.Statement
  private insertMany: (rows: LogEntry[]) => void
  readonly stats: FileStats = { entries: 0, errors: 0, warnings: 0, firstTs: null, lastTs: null }
  private pids = new Set<number>()
  private types = new Set<string>()
  private sev: Record<number, number> = {}

  constructor(private db: DB, private fileId: number) {
    this.insert = db.prepare(`
      INSERT INTO entries (file_id, line_no, ts, ts_raw, pid, tid, level, severity, entry_type, action,
        target, args, caller_proc, caller_file, caller_line, error_no, message, raw)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    this.insertMany = db.transaction((rows: LogEntry[]) => {
      for (const e of rows) {
        this.insert.run(
          this.fileId, e.lineNo, e.ts, e.tsRaw, e.pid, e.tid, e.level, e.severity, e.entryType, e.action,
          e.target, e.args, e.callerProc, e.callerFile, e.callerLine, e.errorNo, e.message, e.raw,
        )
      }
    })
  }

  write(rows: LogEntry[]): void {
    if (!rows.length) return
    this.insertMany(rows)
    const s = this.stats
    for (const e of rows) {
      s.entries++
      if (e.severity >= Severity.Error) s.errors++
      else if (e.severity === Severity.Warning) s.warnings++
      if (e.ts !== null) {
        if (s.firstTs === null || e.ts < s.firstTs) s.firstTs = e.ts
        if (s.lastTs === null || e.ts > s.lastTs) s.lastTs = e.ts
      }
      this.sev[e.severity] = (this.sev[e.severity] ?? 0) + 1
      if (e.pid !== null && this.pids.size < MAX_FACET_VALUES) this.pids.add(e.pid)
      if (e.entryType !== null && this.types.size < MAX_FACET_VALUES) this.types.add(e.entryType)
    }
  }

  get facets(): FileFacets {
    return { pids: [...this.pids], entryTypes: [...this.types], severityCounts: { ...this.sev } }
  }

  /** Remove everything written for this file (used on cancel/failure). */
  discard(): void {
    this.db.prepare('DELETE FROM entries WHERE file_id = ?').run(this.fileId)
  }
}

/* ------------------------------------------------------------------ */
/* Reader / session store (main process)                               */
/* ------------------------------------------------------------------ */

const ROW_COLUMNS = `
  e.id, e.file_id AS fileId, e.line_no AS lineNo, e.ts, e.ts_raw AS tsRaw, e.pid, e.tid, e.level,
  e.severity, e.entry_type AS entryType, e.action, e.target, e.args, e.caller_proc AS callerProc,
  e.caller_file AS callerFile, e.caller_line AS callerLine, e.error_no AS errorNo, e.message, e.raw`

export class SessionStore {
  private viewId = 0

  constructor(readonly db: DB) {
    db.exec('CREATE TEMP TABLE IF NOT EXISTS view (seq INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL)')
  }

  /* ---- files ---- */

  addFile(path: string, name: string, size: number): number {
    const r = this.db.prepare('INSERT INTO files (path, name, size) VALUES (?, ?, ?)').run(path, name, size)
    return Number(r.lastInsertRowid)
  }

  updateFile(
    id: number,
    patch: Partial<
      { parserId: string; parserName: string; status: FileStatus; error: string | null; facets: FileFacets } & FileStats
    >,
  ): void {
    const map: Record<string, string> = {
      parserId: 'parser_id', parserName: 'parser_name', status: 'status', error: 'error', facets: 'facets',
      entries: 'entries', errors: 'errors', warnings: 'warnings', firstTs: 'first_ts', lastTs: 'last_ts',
    }
    const keys = Object.keys(patch).filter((k) => k in map)
    if (!keys.length) return
    const params: Record<string, unknown> = { ...patch, id }
    if (patch.facets) params.facets = JSON.stringify(patch.facets)
    const sql = `UPDATE files SET ${keys.map((k) => `${map[k]} = @${k}`).join(', ')} WHERE id = @id`
    this.db.prepare(sql).run(params)
  }

  listFiles(): FileInfo[] {
    return this.db
      .prepare(
        `SELECT id, path, name, size, parser_id AS parserId, parser_name AS parserName, status, entries,
                errors, warnings, first_ts AS firstTs, last_ts AS lastTs, error
         FROM files ORDER BY id`,
      )
      .all() as FileInfo[]
  }

  getFile(id: number): FileInfo | undefined {
    return this.listFiles().find((f) => f.id === id)
  }

  removeFile(id: number): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM entries WHERE file_id = ?').run(id)
      this.db.prepare('DELETE FROM files WHERE id = ?').run(id)
    })()
  }

  /* ---- view ---- */

  /** Rebuild the materialised view for a filter. Returns a new viewId and the row count. */
  applyView(filter: ViewFilter): ViewResult {
    const viewId = ++this.viewId
    let where: { sql: string; params: unknown[] }
    try {
      where = this.buildWhere(filter)
    } catch (err) {
      return { viewId, total: 0, error: (err as Error).message }
    }
    this.db.transaction(() => {
      this.db.exec('DELETE FROM temp.view')
      this.db
        .prepare(`INSERT INTO temp.view (entry_id) SELECT id FROM entries ${where.sql} ORDER BY id`)
        .run(...where.params)
    })()
    const total = (this.db.prepare('SELECT COUNT(*) AS n FROM temp.view').get() as { n: number }).n
    return { viewId, total }
  }

  /** Rows [start, end) of the current view. Returns null if viewId is stale. */
  getRows(viewId: number, start: number, end: number): EntryRow[] | null {
    if (viewId !== this.viewId) return null
    return this.db
      .prepare(
        `SELECT ${ROW_COLUMNS} FROM temp.view v JOIN entries e ON e.id = v.entry_id
         WHERE v.seq > ? AND v.seq <= ? ORDER BY v.seq`,
      )
      .all(start, end) as EntryRow[]
  }

  /** Merge the per-file facets (cheap: one small row per file). */
  getFacets(): Facets {
    const pids = new Set<number>()
    const types = new Set<string>()
    const severityCounts: Facets['severityCounts'] = {}
    const rows = this.db.prepare("SELECT facets FROM files WHERE facets IS NOT NULL").all() as { facets: string }[]
    for (const r of rows) {
      const f = JSON.parse(r.facets) as FileFacets
      f.pids.forEach((p) => pids.add(p))
      f.entryTypes.forEach((t) => types.add(t))
      for (const [k, n] of Object.entries(f.severityCounts)) {
        const s = Number(k) as Severity
        severityCounts[s] = (severityCounts[s] ?? 0) + n
      }
    }
    return {
      pids: [...pids].sort((a, b) => a - b).slice(0, MAX_FACET_VALUES),
      entryTypes: [...types].sort().slice(0, MAX_FACET_VALUES),
      severityCounts,
    }
  }

  /** Translate a ViewFilter into a WHERE clause. Throws on an invalid regex. */
  buildWhere(f: ViewFilter): { sql: string; params: unknown[] } {
    const parts: string[] = []
    const params: unknown[] = []
    const inList = (col: string, vals: unknown[] | undefined) => {
      if (vals && vals.length) {
        parts.push(`${col} IN (${vals.map(() => '?').join(',')})`)
        params.push(...vals)
      }
    }
    inList('severity', f.severities)
    inList('file_id', f.fileIds)
    inList('pid', f.pids)
    inList('entry_type', f.entryTypes)
    if (f.onlyErrorNumbers) parts.push('error_no IS NOT NULL')

    if (f.program && f.program.trim()) {
      const p = `%${escapeLike(f.program.trim())}%`
      parts.push(`(target LIKE ? ESCAPE '\\' OR caller_file LIKE ? ESCAPE '\\' OR caller_proc LIKE ? ESCAPE '\\')`)
      params.push(p, p, p)
    }

    const s = f.search ?? ''
    if (s) {
      if (f.regex) {
        const re = new RegExp(s, f.caseSensitive ? '' : 'i') // throws SyntaxError on bad input
        this.db.function('pt_match', { deterministic: true }, (v: unknown) => (re.test(String(v ?? '')) ? 1 : 0))
        parts.push('pt_match(raw) = 1')
      } else if (f.caseSensitive) {
        parts.push('instr(raw, ?) > 0')
        params.push(s)
      } else {
        parts.push(`raw LIKE ? ESCAPE '\\'`)
        params.push(`%${escapeLike(s)}%`)
      }
    }
    return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params }
  }
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => '\\' + c)
}
