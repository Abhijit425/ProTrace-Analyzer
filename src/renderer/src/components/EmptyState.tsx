import { Clock, FilePlus2, FolderOpen, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { Logo } from './TopBar'

/** Start screen: drop target, open buttons and the recent list. */
export function EmptyState() {
  const { pickFiles, pickFolder, recent, open, clearRecent } = useStore()
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-8">
      <div className="w-full max-w-2xl">
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white px-8 py-12 text-center dark:border-slate-700 dark:bg-[#0e1420]">
          <div className="mx-auto mb-4 w-fit">
            <Logo size={52} />
          </div>
          <h1 className="text-xl font-semibold">Drop Progress / QAD log files or folders here</h1>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-slate-500">
            Client logs (-clientlog, LOG-MANAGER), 4GLTrace and 4GLMessages are parsed in M1. Other text logs fall back to
            the generic parser. The format is detected automatically.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={pickFiles}
              className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-accent-500"
            >
              <FilePlus2 size={16} /> Open files
            </button>
            <button
              onClick={pickFolder}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-[13px] font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <FolderOpen size={16} /> Open folder
            </button>
          </div>
        </div>

        {recent.length > 0 && (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Recent</span>
              <button onClick={clearRecent} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-500">
                <Trash2 size={11} /> Clear
              </button>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0e1420]">
              {recent.map((r) => (
                <button
                  key={r.path}
                  onClick={() => open([r.path])}
                  className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <Clock size={14} className="shrink-0 text-slate-400" />
                  <span className="text-[13px] font-medium">{r.name}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-slate-400">{r.path}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{new Date(r.openedAt).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
