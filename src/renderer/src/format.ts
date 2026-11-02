import { Severity, SEVERITY_LABEL } from '@shared/types'

export const fmtNum = (n: number) => n.toLocaleString('en-IN')

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const u = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`
}

export function fmtTs(ts: number | null): string {
  if (ts === null) return '—'
  const d = new Date(ts)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

/** Time-only part of the original timestamp text, e.g. "10:15:22.123". */
export function shortTs(tsRaw: string | null, ts: number | null): string {
  if (tsRaw) {
    const m = /(\d{2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)/.exec(tsRaw)
    if (m) return m[1]
  }
  return ts === null ? '' : fmtTs(ts).slice(11)
}

export function fmtSpan(a: number | null, b: number | null): string {
  if (a === null || b === null) return '—'
  let s = Math.round((b - a) / 1000)
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`
}

export const sevLabel = (s: Severity) => SEVERITY_LABEL[s] ?? '?'

/** Tailwind classes for a severity badge. */
export const SEV_BADGE: Record<Severity, string> = {
  [Severity.Trace]: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  [Severity.Debug]: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  [Severity.Info]: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  [Severity.Warning]: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  [Severity.Error]: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  [Severity.Fatal]: 'bg-fuchsia-600 text-white dark:bg-fuchsia-700',
}

/** Row tint so errors stand out while scrolling. */
export const SEV_ROW: Partial<Record<Severity, string>> = {
  [Severity.Warning]: 'bg-amber-50/60 dark:bg-amber-500/[0.06]',
  [Severity.Error]: 'bg-rose-50/70 dark:bg-rose-500/[0.08]',
  [Severity.Fatal]: 'bg-fuchsia-100/70 dark:bg-fuchsia-500/[0.12]',
}

/** Build a highlight regex for the current search (null if none / invalid). */
export function highlightRe(search: string | undefined, regex?: boolean, caseSensitive?: boolean): RegExp | null {
  if (!search) return null
  try {
    const src = regex ? search : search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(src, caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
}
