/**
 * Parser registry. To add a format: write a class implementing LogParser
 * (or extending BaseLineParser) and add an instance to PARSERS below.
 */
import { ClientLogParser } from './clientLogParser'
import { GenericParser } from './genericParser'
import type { DetectionSample, LogParser } from './types'

export const PARSERS: LogParser[] = [
  new ClientLogParser(),
  // M4: new ProtraceParser(), new AppServerParser(), new PasoeParser(), new DbLgParser()
  // M4: new QadQxtendParser(), new TomcatParser(), new QadNetUiParser()
  new GenericParser(), // keep last: the fallback
]

export interface DetectionResult {
  parser: LogParser
  score: number
  /** Every parser's score, highest first (handy for debugging detection). */
  scores: Array<{ id: string; score: number }>
}

export function detectParser(sample: DetectionSample, parsers: LogParser[] = PARSERS): DetectionResult {
  const scores = parsers
    .map((p) => {
      let score = 0
      try {
        score = p.detect(sample)
      } catch {
        score = 0 // a buggy plugin must not break detection
      }
      return { parser: p, id: p.id, score }
    })
    .sort((a, b) => b.score - a.score)
  const best = scores[0]
  return { parser: best.parser, score: best.score, scores: scores.map(({ id, score }) => ({ id, score })) }
}

export function getParser(id: string): LogParser | undefined {
  return PARSERS.find((p) => p.id === id)
}
