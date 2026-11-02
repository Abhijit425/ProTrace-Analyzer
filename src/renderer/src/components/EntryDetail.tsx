import { Copy, X } from 'lucide-react'
import { Severity } from '@shared/types'
import { useStore } from '../store'
import { fmtTs, SEV_BADGE, sevLabel } from '../format'

/** Right-hand panel showing every parsed field of the selected line. */
export function EntryDetail() {
  const { selected: r, select, files, setFilter, showToast } = useStore()
  if (!r) return null
  const file = files.find((f) => f.id === r.fileId)

  const fields: Array<[string, React.ReactNode]> = [
    ['File', file ? <span title={file.path}>{file.name}</span> : r.fileId],
    ['Line', r.lineNo],
    ['Timestamp', r.tsRaw ?? '—'],
    ['Local time', fmtTs(r.ts)],
    ['PID / Thread', `${r.pid ?? '—'} / ${r.tid ?? '—'}`],
    ['Log level', r.level ?? '—'],
    ['Entry type', r.entryType ?? '—'],
    ['Action', r.action ?? '—'],
    ['Target', r.target ?? '—'],
    ['Arguments', r.args ?? '—'],
    ['Caller proc', r.callerProc ?? '—'],
    ['Caller file', r.callerFile ?? '—'],
    ['Caller line', r.callerLine ?? '—'],
    ['Error no.', r.errorNo ?? '—'],
  ]

  const copy = async () => {
    await navigator.clipboard.writeText(r.raw)
    showToast('Raw line copied')
  }

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0e1420]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-slate-200 px-3 dark:border-slate-800">
        <span className={`rounded px-1.5 py-px font-mono text-[10px] font-semibold ${SEV_BADGE[r.severity as Severity]}`}>
          {sevLabel(r.severity)}
        </span>
        <span className="text-[13px] font-semibold">Line {r.lineNo}</span>
        <div className="flex-1" />
        <button onClick={copy} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" title="Copy raw text">
          <Copy size={14} />
        </button>
        <button onClick={() => select(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" title="Close (Esc)">
          <X size={15} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {r.errorNo !== null && (
          <div className="mb-3 rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-[12.5px] dark:border-rose-900 dark:bg-rose-950/40">
            <div className="font-semibold text-rose-700 dark:text-rose-300">Progress error ({r.errorNo})</div>
            <div className="mt-1 text-slate-600 dark:text-slate-400">
              Knowledge-base explanation and grouping arrive in M2.
            </div>
            <button
              onClick={() => setFilter({ search: `(${r.errorNo})`, regex: false })}
              className="mt-2 text-[12px] font-medium text-accent-600 hover:underline dark:text-accent-400"
            >
              Show every ({r.errorNo}) in the log →
            </button>
          </div>
        )}

        <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12px]">
          {fields.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-400">{k}</dt>
              <dd className="break-all font-mono text-slate-700 dark:text-slate-300">{v}</dd>
            </div>
          ))}
        </dl>

        {(r.callerFile || r.target) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {r.callerFile && (
              <Chip onClick={() => setFilter({ program: r.callerFile! })}>Filter: {r.callerFile}</Chip>
            )}
            {r.target && r.target !== r.callerFile && (
              <Chip onClick={() => setFilter({ program: r.target! })}>Filter: {r.target}</Chip>
            )}
            {r.pid !== null && <Chip onClick={() => setFilter({ pids: [r.pid!] })}>Filter: PID {r.pid}</Chip>}
          </div>
        )}

        <div className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Raw text</div>
        <pre className="whitespace-pre-wrap break-all rounded-md bg-slate-50 p-2.5 font-mono text-[11.5px] leading-relaxed text-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {r.raw}
        </pre>
      </div>
    </aside>
  )
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="max-w-full truncate rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:border-accent-500 hover:text-accent-600 dark:border-slate-700 dark:text-slate-400 dark:hover:text-accent-400"
    >
      {children}
    </button>
  )
}
