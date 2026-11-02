import { join } from 'node:path'
import type { LogEntry } from '@shared/types'
import { readLineChunks, readSample } from '../src/main/parsers/lineReader'
import type { LogParser } from '../src/main/parsers/types'

export const fixture = (name: string) => join(__dirname, 'fixtures', name)

/** Run a parser over a fixture file and collect every entry. */
export async function parseFile(parser: LogParser, name: string, chunkBytes?: number): Promise<LogEntry[]> {
  const out: LogEntry[] = []
  const ctx = { fileId: 1, fileName: name, signal: { cancelled: false } }
  for await (const batch of parser.parse(readLineChunks(fixture(name), { chunkBytes }), ctx)) out.push(...batch)
  return out
}

/** Run a parser over in-memory lines. */
export async function parseLines(parser: LogParser, lines: string[]): Promise<LogEntry[]> {
  async function* src() {
    yield { lines, firstLineNo: 1, bytesRead: 0 }
  }
  const out: LogEntry[] = []
  for await (const b of parser.parse(src(), { fileId: 1, fileName: 'mem', signal: { cancelled: false } })) out.push(...b)
  return out
}

export async function sampleOf(name: string) {
  const s = await readSample(fixture(name))
  return { fileName: name, lines: s.lines }
}
