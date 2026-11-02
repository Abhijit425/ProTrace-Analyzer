import { Loader2, Square } from 'lucide-react'
import { useStore } from '../store'
import { fmtBytes, fmtNum } from '../format'

/** Bottom progress bar shown while files are being parsed. */
export function IngestBar() {
  const { ingesting, progress: p, cancel } = useStore()
  if (!ingesting) return null
  const pct = p && p.totalBytes ? Math.min(100, (p.bytesRead / p.totalBytes) * 100) : 0
  return (
    <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-[#0e1420]">
      <div className="flex items-center gap-3 text-[12px]">
        <Loader2 size={14} className="animate-spin text-accent-500" />
        {p ? (
          <span className="min-w-0 truncate">
            <span className="text-slate-500">
              File {p.index} of {p.count}:
            </span>{' '}
            <span className="font-medium">{p.fileName}</span>
            <span className="ml-3 tabular-nums text-slate-500">
              {fmtBytes(p.bytesRead)} / {fmtBytes(p.totalBytes)} · {fmtNum(p.entries)} lines
            </span>
          </span>
        ) : (
          <span className="text-slate-500">Detecting format…</span>
        )}
        <span className="ml-auto tabular-nums font-medium">{pct.toFixed(0)}%</span>
        <button
          onClick={cancel}
          className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[12px] hover:border-rose-400 hover:text-rose-600 dark:border-slate-700"
        >
          <Square size={11} /> Cancel
        </button>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full rounded-full bg-accent-500 transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
