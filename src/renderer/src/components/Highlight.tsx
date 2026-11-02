import { Fragment } from 'react'

/** Renders text with every match of `re` wrapped in <mark>. */
export function Highlight({ text, re }: { text: string; re: RegExp | null }) {
  if (!re || !text) return <>{text}</>
  const out: React.ReactNode[] = []
  let last = 0
  re.lastIndex = 0
  let m: RegExpExecArray | null
  let guard = 0
  while ((m = re.exec(text)) && guard++ < 200) {
    if (m[0] === '') {
      re.lastIndex++ // avoid an infinite loop on zero-width matches
      continue
    }
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(
      <mark key={m.index} className="hit">
        {m[0]}
      </mark>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <Fragment>{out}</Fragment>
}
