import { describe, expect, it, beforeEach } from 'vitest'
import { Severity } from '@shared/types'
import { openDb, EntryWriter, SessionStore, type DB } from '../src/main/db/database'
import { ClientLogParser } from '../src/main/parsers/clientLogParser'
import { parseFile } from './helpers'

let db: DB
let store: SessionStore
let fileId: number

beforeEach(async () => {
  db = openDb(':memory:')
  store = new SessionStore(db)
  fileId = store.addFile('/x/clientlog-4gltrace.log', 'clientlog-4gltrace.log', 2371)
  const w = new EntryWriter(db, fileId)
  w.write(await parseFile(new ClientLogParser(), 'clientlog-4gltrace.log'))
  store.updateFile(fileId, { status: 'done', ...w.stats, facets: w.facets })
})

describe('SessionStore', () => {
  it('stores entries and per-file stats', () => {
    const f = store.listFiles()[0]
    expect(f).toMatchObject({ entries: 20, errors: 3, warnings: 1, status: 'done' })
    expect(f.lastTs! - f.firstTs!).toBe(3999)
  })

  it('pages a view with a dense sequence', () => {
    const v = store.applyView({})
    expect(v.total).toBe(20)
    const rows = store.getRows(v.viewId, 10, 12)!
    expect(rows.map((r) => r.lineNo)).toEqual([11, 12])
    expect(rows[0]).toMatchObject({ errorNo: 91, callerFile: 'xxpo.p', fileId })
  })

  it('filters by text, regex, case, severity, program, pid, error number', () => {
    expect(store.applyView({ search: 'pt_mstr' }).total).toBe(2) // the (91) line + the QRYINFO line
    expect(store.applyView({ search: 'PT_MSTR', caseSensitive: true }).total).toBe(0)
    expect(store.applyView({ search: '\\((91|915)\\)', regex: true }).total).toBe(2)
    expect(store.applyView({ search: '50%_', regex: false }).total).toBe(0) // LIKE wildcards are escaped
    expect(store.applyView({ severities: [Severity.Error, Severity.Fatal] }).total).toBe(3)
    expect(store.applyView({ program: 'xxlisten' }).total).toBe(1)
    expect(store.applyView({ pids: [12345], onlyErrorNumbers: true }).total).toBe(3)
    expect(store.applyView({ entryTypes: ['4GLTRACE'] }).total).toBe(11)
  })

  it('reports an invalid regex instead of throwing', () => {
    expect(store.applyView({ search: '(', regex: true }).error).toBeTruthy()
  })

  it('returns null rows for a stale view id', () => {
    const a = store.applyView({})
    store.applyView({ search: 'Run' })
    expect(store.getRows(a.viewId, 0, 5)).toBeNull()
  })

  it('merges facets from file stats', () => {
    const f = store.getFacets()
    expect(f.pids).toEqual([12345])
    expect(f.entryTypes).toContain('4GLTRACE')
    expect(f.severityCounts[Severity.Trace]).toBe(11)
  })

  it('discards and removes a file', () => {
    new EntryWriter(db, fileId).discard()
    expect(store.applyView({}).total).toBe(0)
    store.removeFile(fileId)
    expect(store.listFiles()).toHaveLength(0)
  })
})
