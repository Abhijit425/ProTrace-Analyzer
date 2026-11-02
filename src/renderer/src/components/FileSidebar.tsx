import { AlertTriangle, FileText, Loader2, X, XCircle } from 'lucide-react'
import { Severity } from '@shared/types'
import { useStore } from '../store'
import { fmtBytes, fmtNum, fmtSpan, SEV_BADGE, sevLabel } from '../format'

const SEV_ORDER = [Severity.Fatal, Severity.Error, Severity.Warning, Severity.Info, Severity.Debug, Severity.Trace]

export function FileSidebar() {
  const { files, facets, filter, setFilter, removeFile, ingesting } = useStore()
  const selected = new Set(filter.fileIds ?? [])

  const toggleFile = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setFilter({ fileIds: [...next] })
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0e1420]">
      <SectionTitle>Loaded files ({files.length})</SectionTitle>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {files.map((f, idx) => {
          const active = selected.has(f.id)
          return (
            <div
              key={f.id}
              onClick={() => f.status === 'done' && toggleFile(f.id)}
              className={`group mb-1 cursor-pointer rounded-lg border px-2.5 py-2 transition-colors ${
                active
                  ? 'border-accent-500 bg-accent-500/10'
                  : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
              title={f.path}
            >
              <div className="flex items-center gap-1.5">
                {f.status === 'parsing' || f.status === 'queued' ? (
                  <Loader2 size={14} className="shrink-0 animate-spin text-accent-500" />
                ) : f.status === 'error' ? (
                  <XCircle size={14} className="shrink-0 text-rose-500" />
                ) : (
                  <FileText size={14} className="shrink-0 text-slate-400" />
                )}
                {files.length > 1 && (
                  <span className="shrink-0 rounded bg-slate-200 px-1 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    F{idx + 1}
                  </span>
                )}
                <span className="truncate text-[13px] font-medium">{f.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    void removeFile(f.id)
                  }}
                  disabled={ingesting}
                  className="ml-auto hidden rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 group-hover:block disabled:hidden dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  title="Remove from analysis"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-5 text-[11px] text-slate-500">
                {f.parserName && <span className="text-accent-600 dark:text-accent-400">{f.parserName}</span>}
                <span>{fmtBytes(f.size)}</span>
                {f.status === 'done' && (
                  <>
                    <span>{fmtNum(f.entries)} lines</span>
                    {f.errors > 0 && <span className="text-rose-500">{fmtNum(f.errors)} err</span>}
                    {f.warnings > 0 && <span className="text-amber-500">{fmtNum(f.warnings)} warn</span>}
                    <span>{fmtSpan(f.firstTs, f.lastTs)}</span>
                  </>
                )}
                {f.status === 'error' && (
                  <span className="flex items-center gap-1 text-rose-500">
                    <AlertTriangle size={11} /> {f.error}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <SectionTitle>Severity</SectionTitle>
      <div className="space-y-1 px-3 pb-3">
        {SEV_ORDER.map((s) => {
          const n = facets.severityCounts[s] ?? 0
          const on = filter.severities?.includes(s)
          return (
            <button
              key={s}
              disabled={!n}
              onClick={() => {
                const cur = new Set(filter.severities ?? [])
                if (cur.has(s)) cur.delete(s)
                else cur.add(s)
                setFilter({ severities: [...cur] })
              }}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-[12px] disabled:opacity-35 ${
                on ? 'ring-1 ring-accent-500' : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className={`rounded px-1.5 py-px font-mono text-[10px] font-semibold ${SEV_BADGE[s]}`}>
                {sevLabel(s)}
              </span>
              <span className="tabular-nums text-slate-500">{fmtNum(n)}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{children}</div>
  )
}
