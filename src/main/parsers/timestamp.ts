/**
 * Timestamp helpers shared by all parsers.
 * Every function returns epoch milliseconds (UTC) or null.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** "+0530", "-07:00", "Z" -> offset in minutes east of UTC. */
export function parseZone(z: string | undefined): number | null {
  if (!z) return null
  if (z === 'Z' || z === 'z') return 0
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(z)
  if (!m) return null
  const mins = parseInt(m[2], 10) * 60 + parseInt(m[3], 10)
  return m[1] === '-' ? -mins : mins
}

/** Build epoch ms. If zone is null the time is treated as local time. */
export function makeTs(
  y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number, zoneMin: number | null,
): number | null {
  if (y < 100) y += 2000
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) return null
  if (zoneMin === null) return new Date(y, mo - 1, d, h, mi, s, ms).getTime()
  return Date.UTC(y, mo - 1, d, h, mi, s, ms) - zoneMin * 60_000
}

/** Pad/truncate a fraction string ("1", "12", "123456") to milliseconds. */
function fracToMs(f: string | undefined): number {
  if (!f) return 0
  return parseInt((f + '00').slice(0, 3), 10)
}

/**
 * OpenEdge LOG-MANAGER / database .lg stamp, without brackets:
 *   26/10/12@10:15:22.123+0530   (client log, yy/mm/dd)
 *   2026/10/12@10:15:22.123+0530 (db .lg, yyyy/mm/dd)
 */
export const OE_TS_RE = /^(\d{2}|\d{4})\/(\d{2})\/(\d{2})@(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?([+-]\d{4})?$/

export function parseOeTimestamp(text: string): number | null {
  const m = OE_TS_RE.exec(text)
  if (!m) return null
  return makeTs(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6], fracToMs(m[7]), parseZone(m[8]))
}

/**
 * Finds any common timestamp anywhere in a line (used by the generic parser).
 * Returns the matched text and epoch ms.
 */
const ANY_TS: Array<{ re: RegExp; conv: (m: RegExpExecArray) => number | null }> = [
  // OpenEdge [yy/mm/dd@hh:mm:ss.sss+zzzz]
  { re: /\[?((?:\d{2}|\d{4})\/\d{2}\/\d{2}@\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:[+-]\d{4})?)\]?/, conv: (m) => parseOeTimestamp(m[1]) },
  // ISO 8601 / log4j: 2026-10-12T10:15:22.123+05:30, 2026-10-12 10:15:22,123
  {
    re: /(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,6}))?\s?(Z|[+-]\d{2}:?\d{2})?/,
    conv: (m) => makeTs(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6], fracToMs(m[7]), parseZone(m[8])),
  },
  // Tomcat / catalina: 12-Oct-2026 10:15:22.123
  {
    re: /(\d{1,2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?/,
    conv: (m) => {
      const mo = MONTHS[m[2].toLowerCase()]
      return mo ? makeTs(+m[3], mo, +m[1], +m[4], +m[5], +m[6], fracToMs(m[7]), null) : null
    },
  },
  // dd/mm/yyyy hh:mm:ss (common in QAD .NET UI / custom logs)
  {
    re: /(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?/,
    conv: (m) => makeTs(+m[3], +m[2], +m[1], +m[4], +m[5], +m[6], fracToMs(m[7]), null),
  },
]

export function findTimestamp(line: string): { raw: string; ts: number } | null {
  for (const { re, conv } of ANY_TS) {
    const m = re.exec(line)
    if (m) {
      const ts = conv(m)
      if (ts !== null && !Number.isNaN(ts)) return { raw: m[0].replace(/^\[|\]$/g, ''), ts }
    }
  }
  return null
}
