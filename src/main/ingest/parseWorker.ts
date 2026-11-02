/**
 * Worker thread: detect the format of ONE file, stream-parse it and write
 * the entries to SQLite. Runs off the main thread so a 1 GB log never
 * blocks the UI.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { basename } from 'node:path'
import { openDb, EntryWriter } from '../db/database'
import { readLineChunks, readSample } from '../parsers/lineReader'
import { detectParser } from '../parsers/registry'
import type { LineChunk } from '../parsers/types'
import type { HostMessage, WorkerInput, WorkerMessage } from './messages'

const input = workerData as WorkerInput
const signal = { cancelled: false }
const post = (m: WorkerMessage) => parentPort!.postMessage(m)

parentPort!.on('message', (m: HostMessage) => {
  if (m.type === 'cancel') signal.cancelled = true
})

async function run(): Promise<void> {
  const sample = await readSample(input.path)
  if (sample.binary) throw new Error('Binary file - not a text log')

  const det = detectParser({ fileName: basename(input.path), lines: sample.lines })
  post({ type: 'detected', parserId: det.parser.id, parserName: det.parser.displayName, score: det.score })

  const db = openDb(input.dbPath)
  const writer = new EntryWriter(db, input.fileId)
  let bytesRead = 0
  let lastPost = 0

  // Wrap the line stream so we can observe byte progress while the parser consumes it.
  async function* tracked(): AsyncGenerator<LineChunk> {
    for await (const c of readLineChunks(input.path)) {
      bytesRead = c.bytesRead
      yield c
    }
  }

  try {
    for await (const batch of det.parser.parse(tracked(), { fileId: input.fileId, fileName: input.name, signal })) {
      if (signal.cancelled) break
      writer.write(batch)
      const now = Date.now()
      if (now - lastPost > 200) {
        lastPost = now
        post({ type: 'progress', bytesRead, entries: writer.stats.entries })
      }
    }
    if (signal.cancelled) {
      writer.discard()
      post({ type: 'cancelled' })
    } else {
      post({ type: 'progress', bytesRead, entries: writer.stats.entries })
      post({ type: 'done', stats: writer.stats, facets: writer.facets })
    }
  } catch (err) {
    writer.discard()
    throw err
  } finally {
    db.close()
  }
}

run().catch((err: Error) => post({ type: 'error', message: err?.message ?? String(err) }))
