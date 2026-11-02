/**
 * OpenEdge client log / LOG-MANAGER parser
 * (-clientlog, -logentrytypes, -logginglevel, LOG-MANAGER:LOGFILE-NAME).
 *
 * Line layout:
 *   [26/10/12@10:15:22.123+0530] P-012345 T-000001 4 4GL 4GLTRACE  Run xxpo.p "1001" [Main Block - xxmain.p @ 245]
 *    timestamp                   pid      thread   lvl subsys type message...
 *
 * Handles 4GLTrace actions (Run / Return / Func / Publish / Subscribe / Invoke / New / Delete ...),
 * 4GLMessages (including "** ... (91)" errors and "(Procedure: 'x.p' Line:12)" locations),
 * DB.Connects, FileID, QryInfo, DynObjects.*, ProEvents.* and any other entry type generically.
 */
import { Severity, type LogEntry } from '@shared/types'
import { BaseLineParser, CONTINUATION, SKIP, blankEntry, type LineResult } from './BaseLineParser'
import { classifyMessage } from './classify'
import { parseOeTimestamp } from './timestamp'
import type { DetectionSample } from './types'

/** Header: [ts] P-pid T-tid level  (the rest of the line is sliced off, not regex-matched, for speed) */
const HEADER_RE = /^\[([0-9/]{8,10}@[0-9:.]{8,15}(?:[+-]\d{4})?)\]\s+P-(\d+)\s+T-(\d+)\s+(\d)(?:\s+|$)/

/** Entry-type tokens that may follow the subsystem column. */
const ENTRY_TYPE_RE =
  /^(--+|4GLTRACE|4GLMESSAGES?|4GLTRANS|DB\.[A-Z.]+|FILEID|QRYINFO|DYNOBJECTS\.[A-Z.]+|PROEVENTS\.[A-Z.]+|TEMP-TABLES|SAX|PROPATH|IGNOREDOPS|ASPLUMBING|ASDEFAULT|DS\.[A-Z.]+|[A-Z0-9]+\.[A-Z0-9.]+)$/i

/** 4GLTrace actions, longest first so "Return from" wins over "Return". */
const TRACE_ACTION_RE =
  /^(Return from|Run super|Run|Return|Func|Function|Publish|Subscribe|Unsubscribe|Invoke|New|Delete|Super|Apply|Trigger|Persistent)\s+(.*)$/i

const CALLER_PARTS_RE = /^(.*?)\s+-\s+(.+?)(?:\s+@\s+(\d+))?$/

/** 4GLMessages location prefix: (Procedure: 'getData xxpo.p' Line:123) */
const PROC_LOCATION_RE = /\(Procedure:\s*'([^']+)'\s*Line:\s*(\d+)\)/i

const DEBUG_TYPES = /^(FILEID|QRYINFO|DYNOBJECTS\.|PROEVENTS\.|TEMP-TABLES|PROPATH|SAX|IGNOREDOPS)/i

export class ClientLogParser extends BaseLineParser {
  readonly id = 'oe-clientlog'
  readonly displayName = 'OpenEdge client log (LOG-MANAGER)'

  detect(sample: DetectionSample): number {
    let lines = 0
    let hits = 0
    let fourGl = 0
    for (const l of sample.lines) {
      if (!l.trim()) continue
      lines++
      const m = HEADER_RE.exec(l)
      if (m) {
        hits++
        if (/^4GL\b/.test(l.slice(m[0].length))) fourGl++
      }
      if (lines >= 400) break
    }
    if (!hits) return 0
    const ratio = hits / lines
    // Client logs are mostly "4GL" subsystem lines; AppServer/PASOE logs share the header.
    return Math.min(1, 0.5 + 0.35 * ratio + 0.15 * (fourGl / hits))
  }

  protected createState(): TsCache {
    return new TsCache()
  }

  protected parseLine(line: string, lineNo: number, state: unknown): LineResult {
    if (!line.trim()) return SKIP
    const m = HEADER_RE.exec(line)
    if (!m) return CONTINUATION

    const e = blankEntry(line, lineNo)
    e.tsRaw = m[1]
    e.ts = (state as TsCache).parse(m[1])
    e.pid = parseInt(m[2], 10)
    e.tid = parseInt(m[3], 10)
    e.level = parseInt(m[4], 10)

    // rest = "<subsystem> [<entryType>] <message>"
    const rest = line.slice(m[0].length).trimEnd()
    const sp1 = rest.search(/\s/)
    const subsystem = sp1 < 0 ? rest : rest.slice(0, sp1)
    let after = sp1 < 0 ? '' : rest.slice(sp1).trimStart()
    const sp2 = after.search(/\s/)
    const maybeType = sp2 < 0 ? after : after.slice(0, sp2)
    if (maybeType && ENTRY_TYPE_RE.test(maybeType)) {
      e.entryType = maybeType.toUpperCase()
      after = sp2 < 0 ? '' : after.slice(sp2).trim()
    } else {
      e.entryType = subsystem.toUpperCase()
    }
    e.message = after

    if (e.entryType === '4GLTRACE') {
      parseTrace(e)
    } else {
      parseMessageLocation(e)
      const fallback = e.entryType && DEBUG_TYPES.test(e.entryType) ? Severity.Debug : Severity.Info
      const c = classifyMessage(e.message, fallback)
      e.severity = c.severity
      e.errorNo = c.errorNo
    }
    return e
  }
}

/** Fill action/target/args/caller from a 4GLTRACE message. */
function parseTrace(e: LogEntry): void {
  e.severity = Severity.Trace
  let body = e.message

  // Trailing caller bracket: [Main Block - xxmain.p @ 245] or [xxpo.p]
  body = body.trimEnd()
  if (body.endsWith(']')) {
    const open = body.lastIndexOf('[')
    if (open >= 0 && body.indexOf(']', open) === body.length - 1) {
      applyCaller(e, body.slice(open + 1, -1).trim())
      body = body.slice(0, open).trim()
    }
  }

  const a = TRACE_ACTION_RE.exec(body)
  if (!a) return
  const verb = a[1].toLowerCase()
  e.action =
    verb === 'return from' || verb === 'return' ? 'Return'
    : verb === 'function' ? 'Func'
    : verb === 'run super' ? 'Super'
    : a[1][0].toUpperCase() + a[1].slice(1).toLowerCase()

  const { first, rest } = splitFirstToken(a[2].trim())
  e.target = first || null
  e.args = rest || null
}

/** "Main Block - xxmain.p @ 245" | "xxpo.p" | "proc-a - lib.p" */
function applyCaller(e: LogEntry, text: string): void {
  if (!text) return
  const p = CALLER_PARTS_RE.exec(text)
  if (p) {
    e.callerProc = p[1].trim() || null
    e.callerFile = p[2].trim() || null
    e.callerLine = p[3] ? parseInt(p[3], 10) : null
  } else {
    e.callerFile = text
  }
}

/** First whitespace-delimited token, honouring double quotes and "Main Block". */
function splitFirstToken(s: string): { first: string; rest: string } {
  // "Main Block" is the one multi-word procedure name OpenEdge prints.
  if (/^Main Block\b/i.test(s)) return { first: 'Main Block', rest: s.slice(10).trim() }
  if (s.startsWith('"')) {
    const end = s.indexOf('"', 1)
    if (end > 0) return { first: s.slice(1, end), rest: s.slice(end + 1).trim() }
  }
  const sp = s.search(/\s/)
  return sp < 0 ? { first: s, rest: '' } : { first: s.slice(0, sp), rest: s.slice(sp + 1).trim() }
}

/** Pull "(Procedure: 'getData xxpo.p' Line:123)" out of a 4GLMessages line. */
function parseMessageLocation(e: LogEntry): void {
  const m = PROC_LOCATION_RE.exec(e.message)
  if (!m) return
  const where = m[1].trim()
  const sp = where.lastIndexOf(' ')
  if (sp > 0) {
    e.callerProc = where.slice(0, sp)
    e.callerFile = where.slice(sp + 1)
  } else {
    e.callerFile = where
  }
  e.callerLine = parseInt(m[2], 10)
}

/**
 * Consecutive log lines usually share the same second, so cache the
 * epoch value of "yy/mm/dd@hh:mm:ss" + zone and only add the milliseconds.
 */
class TsCache {
  private key = ''
  private base: number | null = null

  parse(raw: string): number | null {
    const at = raw.indexOf('@')
    const secEnd = at + 9 // "@hh:mm:ss"
    const dot = raw.charAt(secEnd) === '.' ? secEnd : -1
    if (at < 0 || dot < 0) return parseOeTimestamp(raw)
    let fracEnd = dot + 1
    while (fracEnd < raw.length && raw.charCodeAt(fracEnd) >= 48 && raw.charCodeAt(fracEnd) <= 57) fracEnd++
    const key = raw.slice(0, secEnd) + raw.slice(fracEnd)
    if (key !== this.key) {
      this.key = key
      this.base = parseOeTimestamp(key)
    }
    if (this.base === null) return null
    const frac = (raw.slice(dot + 1, fracEnd) + '00').slice(0, 3)
    return this.base + parseInt(frac, 10)
  }
}
