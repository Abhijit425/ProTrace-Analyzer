/**
 * App state (zustand). Talks to the main process through window.protrace.
 */
import { create } from 'zustand'
import type { EntryRow, Facets, FileInfo, IngestProgress, RecentItem, ViewFilter } from '@shared/types'

const api = window.protrace

export type Theme = 'dark' | 'light'

interface State {
  files: FileInfo[]
  facets: Facets
  recent: RecentItem[]
  filter: ViewFilter
  viewId: number
  total: number
  viewError: string | null
  viewLoading: boolean
  ingesting: boolean
  progress: IngestProgress | null
  selected: EntryRow | null
  theme: Theme
  toast: string | null

  init(): () => void
  open(paths: string[]): Promise<void>
  pickFiles(): Promise<void>
  pickFolder(): Promise<void>
  cancel(): Promise<void>
  newSession(): Promise<void>
  removeFile(id: number): Promise<void>
  setFilter(patch: Partial<ViewFilter>): void
  resetFilter(): void
  refreshView(): Promise<void>
  refreshMeta(): Promise<void>
  select(row: EntryRow | null): void
  toggleTheme(): void
  clearRecent(): Promise<void>
  showToast(msg: string): void
}

const EMPTY_FACETS: Facets = { pids: [], entryTypes: [], severityCounts: {} }

function initialTheme(): Theme {
  try {
    return (localStorage.getItem('pt-theme') as Theme) || 'dark'
  } catch {
    return 'dark'
  }
}

function applyTheme(t: Theme): void {
  document.documentElement.classList.toggle('dark', t === 'dark')
}

let filterTimer: ReturnType<typeof setTimeout> | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useStore = create<State>((set, get) => ({
  files: [],
  facets: EMPTY_FACETS,
  recent: [],
  filter: {},
  viewId: 0,
  total: 0,
  viewError: null,
  viewLoading: false,
  ingesting: false,
  progress: null,
  selected: null,
  theme: initialTheme(),
  toast: null,

  init() {
    applyTheme(get().theme)
    void get().refreshMeta()
    void get().refreshView()
    const offs = [
      api.onIngestProgress((p) => set({ ingesting: true, progress: p })),
      api.onIngestFileDone(async ({ file }) => {
        if (file.status === 'error') get().showToast(`${file.name}: ${file.error ?? 'failed'}`)
        await get().refreshMeta()
        await get().refreshView()
      }),
      api.onIngestComplete(async (d) => {
        set({ ingesting: false, progress: null })
        await get().refreshMeta()
        await get().refreshView()
        if (d.cancelled) get().showToast('Import cancelled')
      }),
    ]
    return () => offs.forEach((off) => off())
  },

  async open(paths) {
    if (!paths.length) return
    const r = await api.ingest(paths)
    if (r.accepted) set({ ingesting: true })
    else get().showToast('No readable log files found')
    await get().refreshMeta()
  },

  async pickFiles() {
    await get().open(await api.pickFiles())
  },

  async pickFolder() {
    await get().open(await api.pickFolder())
  },

  async cancel() {
    await api.cancelIngest()
  },

  async newSession() {
    try {
      await api.newSession()
    } catch (e) {
      get().showToast((e as Error).message)
      return
    }
    set({ filter: {}, selected: null, total: 0, viewId: 0 })
    await get().refreshMeta()
    await get().refreshView()
  },

  async removeFile(id) {
    await api.removeFile(id)
    const f = get().filter
    if (f.fileIds?.includes(id)) set({ filter: { ...f, fileIds: f.fileIds.filter((x) => x !== id) } })
    await get().refreshMeta()
    await get().refreshView()
  },

  setFilter(patch) {
    set({ filter: { ...get().filter, ...patch } })
    // Debounce so typing in the search box doesn't rebuild the view on every key.
    clearTimeout(filterTimer)
    filterTimer = setTimeout(() => void get().refreshView(), 250)
  },

  resetFilter() {
    set({ filter: {} })
    void get().refreshView()
  },

  async refreshView() {
    set({ viewLoading: true })
    const r = await api.applyView(get().filter)
    // Ignore results from an older request that finished late.
    if (r.viewId < get().viewId) return
    set({ viewId: r.viewId, total: r.total, viewError: r.error ?? null, viewLoading: false })
  },

  async refreshMeta() {
    const [files, facets, recent] = await Promise.all([api.listFiles(), api.getFacets(), api.getRecent()])
    set({ files, facets, recent })
  },

  select(row) {
    set({ selected: row })
  },

  toggleTheme() {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(theme)
    try {
      localStorage.setItem('pt-theme', theme)
    } catch {
      /* storage unavailable - theme just won't persist */
    }
    set({ theme })
  },

  async clearRecent() {
    await api.clearRecent()
    set({ recent: [] })
  },

  showToast(msg) {
    set({ toast: msg })
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => set({ toast: null }), 4000)
  },
}))
