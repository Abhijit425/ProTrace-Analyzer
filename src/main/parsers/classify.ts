import { Severity } from '@shared/types'

/**
 * Progress messages end with the message number in brackets: "... (91)".
 * We take the LAST bracketed number at the end of the text.
 */
const ERRNO_AT_END = /\((\d{1,6})\)\s*\.?\s*$/
const ERROR_WORDS = /\b(error|exception|failed|failure|unable|cannot|can't|invalid|not available|denied|abnormal|fatal|severe)\b/i
const WARN_WORDS = /\b(warning|warn)\b/i

export interface Classification {
  severity: Severity
  errorNo: number | null
}

/**
 * Classify a free-text message.
 * - "SYSTEM ERROR" / "protrace" / "Stack trace" -> Fatal
 * - "** ..."                                   -> Error (Progress error convention)
 * - error words                                -> Error
 * - warning words                              -> Warning
 * An error number is only taken when the message looks like a Progress
 * message, so "(1)" in ordinary text isn't mistaken for an error.
 */
export function classifyMessage(msg: string, fallback: Severity = Severity.Info): Classification {
  const hasStars = msg.includes('**')
  let severity = fallback

  if (/SYSTEM ERROR|protrace\.\d+|\bcore dumped\b|Stack trace/i.test(msg)) severity = Severity.Fatal
  else if (hasStars) severity = WARN_WORDS.test(msg) ? Severity.Warning : Severity.Error
  else if (ERROR_WORDS.test(msg)) severity = Math.max(fallback, Severity.Error)
  else if (WARN_WORDS.test(msg)) severity = Math.max(fallback, Severity.Warning)

  let errorNo: number | null = null
  const m = ERRNO_AT_END.exec(msg)
  if (m && (hasStars || severity >= Severity.Warning)) errorNo = parseInt(m[1], 10)

  return { severity, errorNo }
}
