import { promises as fsp } from 'node:fs'
import { basename, join } from 'node:path'
import type { RecentItem } from '@shared/types'

const MAX_RECENT = 15

/** Small JSON-backed list of recently opened files/folders. */
export class RecentList {
  private file: string

  constructor(userDataDir: string) {
    this.file = join(userDataDir, 'recent.json')
  }

  async get(): Promise<RecentItem[]> {
    try {
      const items = JSON.parse(await fsp.readFile(this.file, 'utf8')) as RecentItem[]
      return Array.isArray(items) ? items : []
    } catch {
      return []
    }
  }

  async add(paths: string[]): Promise<void> {
    const now = Date.now()
    const items = (await this.get()).filter((i) => !paths.some((p) => p.toLowerCase() === i.path.toLowerCase()))
    const added = paths.map((p) => ({ path: p, name: basename(p), openedAt: now }))
    await fsp.writeFile(this.file, JSON.stringify([...added, ...items].slice(0, MAX_RECENT), null, 2))
  }

  async clear(): Promise<void> {
    await fsp.rm(this.file, { force: true })
  }
}
