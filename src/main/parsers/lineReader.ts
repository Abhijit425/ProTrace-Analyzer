import { createReadStream, promises as fsp } from 'node:fs'
import { StringDecoder } from 'node:string_decoder'
import type { LineChunk } from './types'

const CHUNK_BYTES = 1024 * 1024 // 1 MB reads keep memory flat even for multi-GB files

/**
 * Streams a file as chunks of complete lines.
 * Handles \n and \r\n, multi-byte UTF-8 split across reads, and a final line without newline.
 */
export async function* readLineChunks(
  path: string,
  opts: { startLine?: number; chunkBytes?: number } = {},
): AsyncGenerator<LineChunk> {
  const stream = createReadStream(path, { highWaterMark: opts.chunkBytes ?? CHUNK_BYTES })
  const decoder = new StringDecoder('utf8')
  let carry = ''
  let lineNo = opts.startLine ?? 1
  let bytesRead = 0

  try {
    for await (const buf of stream as AsyncIterable<Buffer>) {
      bytesRead += buf.length
      const text = carry + decoder.write(buf)
      const parts = text.split('\n')
      carry = parts.pop() ?? ''
      if (!parts.length) continue
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]
        if (p.endsWith('\r')) parts[i] = p.slice(0, -1)
      }
      yield { lines: parts, firstLineNo: lineNo, bytesRead }
      lineNo += parts.length
    }
    const tail = carry + decoder.end()
    if (tail.length) yield { lines: [tail.replace(/\r$/, '')], firstLineNo: lineNo, bytesRead }
  } finally {
    stream.destroy()
  }
}

/** Reads the first `bytes` of a file for format detection. */
export async function readSample(
  path: string,
  bytes = 64 * 1024,
): Promise<{ lines: string[]; binary: boolean }> {
  const fh = await fsp.open(path, 'r')
  try {
    const buf = Buffer.alloc(bytes)
    const { bytesRead } = await fh.read(buf, 0, bytes, 0)
    const data = buf.subarray(0, bytesRead)
    // NUL bytes in the first 8 KB => binary (database extents, .r files, archives...)
    const binary = data.subarray(0, 8192).includes(0)
    const text = data.toString('utf8')
    const lines = text.split('\n').map((l) => l.replace(/\r$/, ''))
    if (bytesRead === bytes) lines.pop() // last line is probably cut off
    return { lines, binary }
  } finally {
    await fh.close()
  }
}
