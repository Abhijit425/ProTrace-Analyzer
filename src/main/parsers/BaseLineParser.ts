import type { LogEntry } from '@shared/types'
import type { DetectionSample, LineChunk, LogParser, ParseContext } from './types'

/** Returned by parseLine() when a line continues the previous entry. */
export const CONTINUATION = Symbol('continuation')
/** Returned by parseLine() for lines that should be dropped (e.g. blank). */
export const SKIP = Symbol('skip')

export type LineResult = LogEntry | typeof CONTINUATION | typeof SKIP

/**
 * Helper base class for line-oriented formats.
 *
 * Subclasses implement parseLine(). Lines that don't start a new entry can
 * return CONTINUATION and are appended to the previous entry's raw/message
 * (stack dumps, wrapped messages). Entries are emitted in batches.
 */
export abstract class BaseLineParser implements LogParser {
  abstract readonly id: string
  abstract readonly displayName: string
  abstract detect(sample: DetectionSample): number

  /** Max physical lines folded into one entry, so a runaway continuation can't eat memory. */
  protected maxContinuationLines = 200

  /** Parse one physical line. Called with a fresh state per file (see createState). */
  protected abstract parseLine(line: string, lineNo: number, state: unknown): LineResult

  /** Per-file mutable state (e.g. last timestamp). Override when needed. */
  protected createState(): unknown {
    return {}
  }

  /** Hook to adjust an entry once all continuation lines are attached. */
  protected finalize(entry: LogEntry): LogEntry {
    return entry
  }

  async *parse(stream: AsyncIterable<LineChunk>, ctx: ParseContext): AsyncIterable<LogEntry[]> {
    const state = this.createState()
    let pending: LogEntry | null = null
    let pendingExtra = 0

    for await (const chunk of stream) {
      if (ctx.signal.cancelled) return
      const out: LogEntry[] = []
      for (let i = 0; i < chunk.lines.length; i++) {
        const line = chunk.lines[i]
        const lineNo = chunk.firstLineNo + i
        const r = this.parseLine(line, lineNo, state)
        if (r === SKIP) continue
        if (r === CONTINUATION) {
          if (pending && pendingExtra < this.maxContinuationLines) {
            pending.raw += '\n' + line
            pending.message += '\n' + line.trim()
            pendingExtra++
            continue
          }
          // No entry to attach to (or too many lines): keep it as a standalone line.
          if (pending) out.push(this.finalize(pending))
          pending = this.orphan(line, lineNo)
          pendingExtra = 0
          continue
        }
        if (pending) out.push(this.finalize(pending))
        pending = r
        pendingExtra = 0
      }
      if (out.length) yield out
    }
    if (pending) yield [this.finalize(pending)]
  }

  /** Entry for a line that couldn't be attached to anything. */
  protected orphan(line: string, lineNo: number): LogEntry {
    return blankEntry(line, lineNo)
  }
}

/** Convenience factory with every optional field set to null. */
export function blankEntry(raw: string, lineNo: number): LogEntry {
  return {
    lineNo,
    ts: null,
    tsRaw: null,
    pid: null,
    tid: null,
    level: null,
    severity: 2, // Severity.Info (literal avoids a runtime enum import cycle)
    entryType: null,
    action: null,
    target: null,
    args: null,
    callerProc: null,
    callerFile: null,
    callerLine: null,
    errorNo: null,
    message: raw.trim(),
    raw,
  }
}
