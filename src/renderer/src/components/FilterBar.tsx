import { CaseSensitive, FilterX, Hash, Regex, Search } from 'lucide-react'
import { useStore } from '../store'
import { fmtNum } from '../format'

export function FilterBar() {
  const { filter, setFilter, resetFilter, facets, total, viewError, viewLoading } = useStore()
  const active =
    !!filter.search ||
    !!filter.program ||
    !!filter.onlyErrorNumbers ||
    !!filter.severities?.length ||
    !!filter.fileIds?.length ||
    !!filter.pids?.length ||
    !!filter.entryTypes?.length

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-[#0e1420]">
      {/* Search */}
      <div
        className={`flex h-8 min-w-72 flex-1 items-center gap-1 rounded-md border bg-slate-50 pl-2 pr-1 dark:bg-slate-900 ${
          viewError ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
        }`}
      >
        <Search size={14} className="shrink-0 text-slate-400" />
        <input
          value={filter.search ?? ''}
          onChange={(e) => setFilter({ search: e.target.value })}
          placeholder={filter.regex ? 'Regex, e.g. \\((91|132|565)\\)' : 'Search raw log text…'}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-[12.5px] outline-none placeholder:font-sans placeholder:text-slate-400"
          spellCheck={false}
        />
        <Toggle on={!!filter.regex} onClick={() => setFilter({ regex: !filter.regex })} title="Regular expression">
          <Regex size={14} />
        </Toggle>
        <Toggle
          on={!!filter.caseSensitive}
          onClick={() => setFilter({ caseSensitive: !filter.caseSensitive })}
          title="Match case"
        >
          <CaseSensitive size={15} />
        </Toggle>
      </div>

      <input
        value={filter.program ?? ''}
        onChange={(e) => setFilter({ program: e.target.value })}
        placeholder="Program / procedure"
        className="h-8 w-44 rounded-md border border-slate-200 bg-slate-50 px-2 font-mono text-[12.5px] outline-none placeholder:font-sans placeholder:text-slate-400 focus:border-accent-500 dark:border-slate-700 dark:bg-slate-900"
        spellCheck={false}
      />

      <Select
        value={filter.pids?.[0]?.toString() ?? ''}
        onChange={(v) => setFilter({ pids: v ? [Number(v)] : [] })}
        label="All PIDs"
        options={facets.pids.map((p) => ({ value: String(p), label: `PID ${p}` }))}
      />
      <Select
        value={filter.entryTypes?.[0] ?? ''}
        onChange={(v) => setFilter({ entryTypes: v ? [v] : [] })}
        label="All entry types"
        options={facets.entryTypes.map((t) => ({ value: t, label: t }))}
      />

      <Toggle
        on={!!filter.onlyErrorNumbers}
        onClick={() => setFilter({ onlyErrorNumbers: !filter.onlyErrorNumbers })}
        title="Only lines with a Progress error number (NNN)"
        wide
      >
        <Hash size={13} /> Error no.
      </Toggle>

      {active && (
        <button
          onClick={resetFilter}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-[12px] text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <FilterX size={14} /> Clear
        </button>
      )}

      <div className="ml-auto pl-2 text-[12px] tabular-nums text-slate-500">
        {viewError ? (
          <span className="text-rose-500">Invalid regex: {viewError}</span>
        ) : (
          <>
            {viewLoading && <span className="mr-2 animate-pulse">filtering…</span>}
            {fmtNum(total)} lines
          </>
        )}
      </div>
    </div>
  )
}

function Toggle(props: { on: boolean; onClick: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <button
      onClick={props.onClick}
      title={props.title}
      className={`flex items-center gap-1 rounded ${props.wide ? 'h-8 border px-2 text-[12px]' : 'h-6 px-1'} ${
        props.on
          ? 'border-accent-500 bg-accent-500/15 text-accent-600 dark:text-accent-400'
          : 'border-slate-200 text-slate-400 hover:text-slate-700 dark:border-slate-700 dark:hover:text-slate-200'
      }`}
    >
      {props.children}
    </button>
  )
}

function Select(props: {
  value: string
  onChange: (v: string) => void
  label: string
  options: Array<{ value: string; label: string }>
}) {
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      className="h-8 max-w-44 rounded-md border border-slate-200 bg-slate-50 px-2 text-[12.5px] outline-none focus:border-accent-500 dark:border-slate-700 dark:bg-slate-900"
    >
      <option value="">{props.label}</option>
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
