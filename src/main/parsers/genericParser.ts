/**
 * Fallback parser for unknown formats.
 * Each non-blank line becomes an entry. It finds a timestamp anywhere in the
 * line, flags "**", "(NNNN)", ERROR/WARN/SEVERE, and treats indented lines
 * and Java "at ..." / "Caused by:" frames as continuations of the previous entry.
 */
import { Severity, type LogEntry } from '@shared/types'
import { BaseLineParser, CONTINUATION, SKIP, blankEntry, type LineResult } from './BaseLineParser'
import { classifyMessage } from './classify'
import { findTimestamp } from './timestamp'
import type { DetectionSample } from './types'

const CONT_RE =
  /^(\s+\S|\s*at\s+[\w$.<>]+\(|\s*Caused by:|\s*\.\.\.\s*\d+\s+more|[\w$]+(?:\.[\w$]+)+(?:Exception|Error|Throwable)\b)/
/** A Progress "** message (NNN)" anywhere in a (multi-line) entry. */
const STAR_ERRNO_RE = /\*\*[^\n]*?\((\d{1,6})\)/
const LEVEL_RE = /\b(FATAL|SEVERE|ERROR|ERR|WARNING|WARN|INFO|DEBUG|TRACE|FINE|FINER|FINEST)\b/

const LEVEL_MAP: Record<string, Severity> = {
  FATAL: Severity.Fatal,
  SEVERE: Severity.Error,
  ERROR: Severity.Error,
  ERR: Severity.Error,
  WARNING: Severity.Warning,
  WARN: Severity.Warning,
  INFO: Severity.Info,
  DEBUG: Severity.Debug,
  FINE: Severity.Debug,
  TRACE: Severity.Trace,
  FINER: Severity.Trace,
  FINEST: Severity.Trace,
}

export class GenericParser extends BaseLineParser {
  readonly id = 'generic'
  readonly displayName = 'Generic text log'

  /** Always a weak match so it only wins when nothing else does. */
  detect(_sample: DetectionSample): number {
    return 0.05
  }

  protected parseLine(line: string, lineNo: number): LineResult {
    if (!line.trim()) return SKIP
    if (CONT_RE.test(line)) return CONTINUATION

    const e = blankEntry(line, lineNo)
    const t = findTimestamp(line)
    if (t) {
      e.ts = t.ts
      e.tsRaw = t.raw
    }

    const lv = LEVEL_RE.exec(line)
    const base = lv ? LEVEL_MAP[lv[1]] : Severity.Info
    if (lv) e.entryType = lv[1]
    const c = classifyMessage(line, base)
    // An explicit level word is more reliable than keyword guessing, except for "**" errors.
    e.severity = lv && !line.includes('**') ? base : c.severity
    e.errorNo = c.errorNo
    return e
  }

  /** Continuation lines (e.g. "Caused by: ... ** ... (91)") can carry the Progress error number. */
  protected finalize(e: LogEntry): LogEntry {
    if (e.errorNo === null && e.raw.includes('**')) {
      const m = STAR_ERRNO_RE.exec(e.raw)
      if (m) {
        e.errorNo = parseInt(m[1], 10)
        if (e.severity < Severity.Error) e.severity = Severity.Error
      }
    }
    return e
  }
}
