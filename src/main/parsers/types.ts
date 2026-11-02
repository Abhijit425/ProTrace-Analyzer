/**
 * Parser plugin contract.
 *
 * Every log format is one LogParser. The registry asks each parser to
 * detect() a small sample of the file, picks the highest score, then streams
 * the whole file through parse().
 *
 * Parsers must be pure Node/TypeScript (no Electron imports) so they can run
 * inside a worker thread and in unit tests.
 */
import type { LogEntry } from '@shared/types'

export interface DetectionSample {
  /** File name only (no directory), e.g. "client.log" or "protrace.12345". */
  fileName: string
  /** First lines of the file (about 64 KB), line endings stripped. */
  lines: string[]
}

export interface LineChunk {
  lines: string[]
  /** 1-based line number of lines[0]. */
  firstLineNo: number
  /** Total bytes consumed from the file so far (for progress). */
  bytesRead: number
}

export interface ParseContext {
  fileId: number
  fileName: string
  /** Set to true by the host to request cancellation. Parsers should check it between chunks. */
  signal: { cancelled: boolean }
}

export interface LogParser {
  /** Stable id stored with each file, e.g. "oe-clientlog". */
  readonly id: string
  readonly displayName: string
  /**
   * Return a confidence between 0 and 1 that the sample belongs to this format.
   * 0 = definitely not, 1 = certain. The generic fallback returns a small constant.
   */
  detect(sample: DetectionSample): number
  /**
   * Turn a stream of line chunks into batches of entries.
   * Must stream: never buffer the whole file.
   */
  parse(stream: AsyncIterable<LineChunk>, ctx: ParseContext): AsyncIterable<LogEntry[]>
}
