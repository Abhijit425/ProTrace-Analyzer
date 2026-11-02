/**
 * Virtualised raw log viewer.
 *
 * Rows are fetched from the main process in pages of 500 and cached.
 * Browsers cap element height (~33M px), so for very large views the
 * scrollbar is scaled: the scroll area is at most MAX_PX tall and the
 * scroll position is mapped proportionally to a row index. The mouse wheel
 * and keyboard move by whole rows in that mode so scrolling stays precise.
 */
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { Severity, type EntryRow } from '@shared/types'
import { useStore } from '../store'
import { SEV_BADGE, SEV_ROW, highlightRe, sevLabel, shortTs } from '../format'
import { Highlight } from './Highlight'

const ROW = 22
const PAGE = 500
const MAX_PAGES = 80
const MAX_PX = 8_000_000
const OVERSCAN = 20

/* ---------------- row cache ---------------- */

function useRowCache(viewId: number, total: number) {
  const cache = useRef(new Map<number, EntryRow[]>())
  const loading = useRef(new Set<number>())
  const currentView = useRef(viewId)
  const [, bump] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    currentView.current = viewId
    cache.current.clear()
    loading.current.clear()
    bump()
  }, [viewId, total])

  return useCallback(
    (i: number): EntryRow | undefined => {
      const p = Math.floor(i / PAGE)
      const page = cache.current.get(p)
      if (page) return page[i - p * PAGE]
      if (!loading.current.has(p) && viewId > 0) {
        loading.current.add(p)
        const v = viewId
        void window.protrace.getRows(v, p * PAGE, Math.min(total, (p + 1) * PAGE)).then((rows) => {
          loading.current.delete(p)
          if (!rows || currentView.current !== v) return
          if (cache.current.size >= MAX_PAGES) cache.current.delete(cache.current.keys().next().value!)
          cache.current.set(p, rows)
          bump()
        })
      }
      return undefined
    },
    [viewId, total],
  )
}

/* ---------------- viewer ---------------- */

export function RawLogViewer() {
  const { viewId, total, filter, files, select, selected } = useStore()
  const getRow = useRowCache(viewId, total)
  const scroller = useRef<HTMLDivElement>(null)
  const [viewportH, setViewportH] = useState(600)
  const [scrollTop, setScrollTop] = useState(0)
  const [first, setFirst] = useState(0) // first visible row in scaled mode
  const [selIndex, setSelIndex] = useState<number | null>(null)
  const programmatic = useRef(false)

  const natural = total * ROW
  const scaled = natural > MAX_PX
  const scrollH = scaled ? MAX_PX : natural
  const visible = Math.ceil(viewportH / ROW) + 1
  const maxFirst = Math.max(0, total - visible + 1)
  const range = Math.max(1, scrollH - viewportH)

  const firstRow = scaled ? first : Math.floor(scrollTop / ROW)
  const start = Math.max(0, firstRow - (scaled ? 0 : OVERSCAN))
  const end = Math.min(total, firstRow + visible + (scaled ? 0 : OVERSCAN))

  const re = highlightRe(filter.search, filter.regex, filter.caseSensitive)
  const multiFile = files.length > 1
  const fileName = (id: number) => {
    const i = files.findIndex((f) => f.id === id)
    return i < 0 ? `#${id}` : `F${i + 1}|${files[i].name}`
  }

  // Track viewport size.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight))
    ro.observe(el)
    setViewportH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  // New view: back to the top, clear selection.
  useEffect(() => {
    setFirst(0)
    setSelIndex(null)
    if (scroller.current) scroller.current.scrollTop = 0
  }, [viewId])

  /** Scroll so row i is visible (works in both modes). */
  const reveal = useCallback(
    (i: number) => {
      const el = scroller.current
      if (!el) return
      if (scaled) {
        const cur = first
        let f = cur
        if (i < cur) f = i
        else if (i >= cur + visible - 1) f = i - visible + 2
        f = Math.max(0, Math.min(maxFirst, f))
        setFirst(f)
        programmatic.current = true
        el.scrollTop = (f / Math.max(1, maxFirst)) * range
      } else {
        const top = i * ROW
        if (top < el.scrollTop) el.scrollTop = top
        else if (top + ROW > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW - el.clientHeight
      }
    },
    [scaled, first, visible, maxFirst, range],
  )

  const onScroll = () => {
    const el = scroller.current!
    setScrollTop(el.scrollTop)
    if (scaled) {
      if (programmatic.current) {
        programmatic.current = false
        return
      }
      setFirst(Math.round((el.scrollTop / range) * maxFirst))
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    if (!scaled) return
    const rows = Math.round(e.deltaY / ROW) || Math.sign(e.deltaY)
    const f = Math.max(0, Math.min(maxFirst, first + rows))
    setFirst(f)
    programmatic.current = true
    scroller.current!.scrollTop = (f / Math.max(1, maxFirst)) * range
  }

  // Keep the detail panel in sync once the selected row's page has loaded.
  const selRow = selIndex !== null ? getRow(selIndex) : undefined
  useEffect(() => {
    if (selRow && selRow.id !== selected?.id) select(selRow)
  }, [selRow, selected, select])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!total) return
    const page = Math.max(1, visible - 2)
    const cur = selIndex ?? firstRow
    let next: number | null = null
    if (e.key === 'ArrowDown') next = cur + 1
    else if (e.key === 'ArrowUp') next = cur - 1
    else if (e.key === 'PageDown') next = cur + page
    else if (e.key === 'PageUp') next = cur - page
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = total - 1
    else if (e.key === 'Escape') {
      setSelIndex(null)
      select(null)
      return
    }
    if (next === null) return
    e.preventDefault()
    next = Math.max(0, Math.min(total - 1, next))
    setSelIndex(next)
    reveal(next)
  }

  const rows: React.ReactNode[] = []
  for (let i = start; i < end; i++) {
    const r = getRow(i)
    const top = scaled ? scrollTop + (i - first) * ROW : i * ROW
    rows.push(
      <Row
        key={i}
        top={top}
        row={r}
        selected={i === selIndex}
        onClick={() => {
          setSelIndex(i)
          if (r) select(r)
        }}
        re={re}
        fileName={multiFile && r ? fileName(r.fileId) : null}
      />,
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <HeaderRow multiFile={multiFile} />
      <div
        ref={scroller}
        tabIndex={0}
        onScroll={onScroll}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        className="relative min-h-0 flex-1 overflow-auto font-mono text-[12px] outline-none"
      >
        <div style={{ height: scrollH }} className="relative">
          {rows}
        </div>
        {total === 0 && (
          <div className="absolute inset-0 flex items-center justify-center font-sans text-sm text-slate-400">
            No lines match the current filter.
          </div>
        )}
      </div>
    </div>
  )
}

const COLS = 'grid grid-cols-[84px_92px_54px_64px_96px_minmax(0,1fr)] items-center gap-2 px-3'

function HeaderRow({ multiFile }: { multiFile: boolean }) {
  return (
    <div
      className={`${COLS} h-7 shrink-0 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-[#0d131e]`}
    >
      <span className="text-right">{multiFile ? 'File · Line' : 'Line'}</span>
      <span>Time</span>
      <span>Sev</span>
      <span>PID</span>
      <span>Type</span>
      <span>Message</span>
    </div>
  )
}

const ACTION_COLOR: Record<string, string> = {
  Run: 'text-emerald-600 dark:text-emerald-400',
  Return: 'text-slate-400',
  Func: 'text-violet-600 dark:text-violet-400',
  Invoke: 'text-violet-600 dark:text-violet-400',
  Publish: 'text-cyan-600 dark:text-cyan-400',
  Subscribe: 'text-cyan-600 dark:text-cyan-400',
}

function Row(props: {
  top: number
  row: EntryRow | undefined
  selected: boolean
  onClick: () => void
  re: RegExp | null
  fileName: string | null
}) {
  const { row: r, re } = props
  const base = `${COLS} absolute left-0 right-0 cursor-default border-b border-slate-100 dark:border-slate-800/40`
  const style = { top: props.top, height: ROW }
  if (!r) {
    return (
      <div style={style} className={base}>
        <span className="col-span-6 h-2.5 w-2/3 animate-pulse rounded bg-slate-200/70 dark:bg-slate-800/70" />
      </div>
    )
  }
  const firstLine = r.message.split('\n', 1)[0]
  const extra = r.raw.split('\n').length - 1
  return (
    <div
      style={style}
      onClick={props.onClick}
      className={`${base} ${
        props.selected
          ? '!bg-accent-500/20 outline outline-1 -outline-offset-1 outline-accent-500'
          : `${SEV_ROW[r.severity as Severity] ?? ''} hover:bg-slate-100 dark:hover:bg-slate-800/50`
      }`}
    >
      <span className="truncate text-right tabular-nums text-slate-400" title={props.fileName?.split('|')[1]}>
        {props.fileName ? (
          <span className="mr-1.5 rounded bg-slate-200 px-1 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {props.fileName.split('|')[0]}
          </span>
        ) : null}
        {r.lineNo}
      </span>
      <span className="truncate tabular-nums text-slate-500">{shortTs(r.tsRaw, r.ts)}</span>
      <span>
        <span className={`rounded px-1 py-px text-[10px] font-semibold ${SEV_BADGE[r.severity as Severity]}`}>
          {sevLabel(r.severity)}
        </span>
      </span>
      <span className="truncate tabular-nums text-slate-500">{r.pid ?? ''}</span>
      <span className="truncate text-slate-500" title={r.entryType ?? undefined}>
        {r.entryType ?? ''}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 whitespace-pre">
        {r.errorNo !== null && (
          <span className="shrink-0 rounded bg-rose-600 px-1 text-[10px] font-semibold text-white">({r.errorNo})</span>
        )}
        {r.action ? (
          <span className="truncate">
            <span className={`font-semibold ${ACTION_COLOR[r.action] ?? 'text-sky-600 dark:text-sky-400'}`}>
              {r.action}
            </span>{' '}
            <Highlight text={r.target ?? ''} re={re} />
            {r.args ? (
              <span className="text-slate-500">
                {' '}
                <Highlight text={r.args} re={re} />
              </span>
            ) : null}
            {r.callerFile ? (
              <span className="text-slate-400">
                {'  ← '}
                {r.callerProc ? `${r.callerProc} · ` : ''}
                {r.callerFile}
                {r.callerLine !== null ? ` @ ${r.callerLine}` : ''}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="truncate">
            <Highlight text={firstLine} re={re} />
          </span>
        )}
        {extra > 0 && (
          <span className="shrink-0 rounded bg-slate-200 px-1 text-[10px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            +{extra}
          </span>
        )}
      </span>
    </div>
  )
}
