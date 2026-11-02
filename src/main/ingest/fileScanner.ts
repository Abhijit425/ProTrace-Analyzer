import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

/** Extensions that are never logs (database extents, r-code, archives, images...). */
const SKIP_EXT = /\.(db|d\d+|b\d+|a\d+|st|lk|r|pl|zip|gz|7z|rar|jar|war|exe|dll|so|png|jpe?g|gif|ico|pdf|docx?|xlsx?|class)$/i
const SKIP_DIRS = new Set(['node_modules', '.git', '.svn'])
const MAX_FILES = 2000

export interface ScanResult {
  files: Array<{ path: string; size: number }>
  skipped: string[]
}

/**
 * Expand a mix of file and folder paths into a flat list of candidate log files.
 * Folders are walked recursively. Empty and obviously binary files are skipped
 * (the worker also rejects binary content it detects).
 */
export async function scanPaths(paths: string[]): Promise<ScanResult> {
  const files: ScanResult['files'] = []
  const skipped: string[] = []
  const seen = new Set<string>()

  async function visit(p: string, fromFolder: boolean): Promise<void> {
    if (files.length >= MAX_FILES) return
    let st
    try {
      st = await fsp.stat(p)
    } catch {
      skipped.push(p)
      return
    }
    if (st.isDirectory()) {
      const entries = await fsp.readdir(p, { withFileTypes: true })
      entries.sort((a, b) => a.name.localeCompare(b.name))
      for (const d of entries) {
        if (d.isDirectory() && SKIP_DIRS.has(d.name)) continue
        await visit(join(p, d.name), true)
      }
      return
    }
    if (!st.isFile()) return
    const key = p.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    // Files picked explicitly are always tried; files found in folders are filtered by extension.
    if (st.size === 0 || (fromFolder && SKIP_EXT.test(p))) {
      skipped.push(p)
      return
    }
    files.push({ path: p, size: st.size })
  }

  for (const p of paths) await visit(p, false)
  return { files, skipped }
}
