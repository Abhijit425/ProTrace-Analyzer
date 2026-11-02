import { describe, expect, it } from 'vitest'
import { detectParser } from '../../src/main/parsers/registry'
import { findTimestamp, parseOeTimestamp } from '../../src/main/parsers/timestamp'
import { classifyMessage } from '../../src/main/parsers/classify'
import { Severity } from '@shared/types'
import { sampleOf } from '../helpers'

describe('auto-detect', () => {
  it.each([
    ['clientlog-4gltrace.log', 'oe-clientlog'],
    ['clientlog-messages.log', 'oe-clientlog'],
    ['unknown-app.log', 'generic'],
  ])('%s -> %s', async (file, id) => {
    expect(detectParser(await sampleOf(file)).parser.id).toBe(id)
  })

  it('survives a parser that throws in detect()', async () => {
    const bad = { id: 'bad', displayName: 'bad', detect: () => { throw new Error('x') }, parse: async function* () {} }
    const r = detectParser(await sampleOf('unknown-app.log'), [bad as never, ...(await import('../../src/main/parsers/registry')).PARSERS])
    expect(r.parser.id).toBe('generic')
  })
})

describe('timestamps', () => {
  it('parses OpenEdge stamps with zone', () => {
    expect(parseOeTimestamp('26/10/12@10:15:22.123+0530')).toBe(Date.UTC(2026, 9, 12, 4, 45, 22, 123))
    expect(parseOeTimestamp('2026/10/12@10:15:22.123-0700')).toBe(Date.UTC(2026, 9, 12, 17, 15, 22, 123))
    expect(parseOeTimestamp('garbage')).toBeNull()
  })
  it('finds timestamps inside lines', () => {
    expect(findTimestamp('x [26/10/12@10:15:22.123+0530] y')?.ts).toBe(Date.UTC(2026, 9, 12, 4, 45, 22, 123))
    expect(findTimestamp('2026-10-12T10:15:22.5Z boom')?.ts).toBe(Date.UTC(2026, 9, 12, 10, 15, 22, 500))
    expect(findTimestamp('no time here')).toBeNull()
  })
})

describe('classifyMessage', () => {
  it.each([
    ['** No pt_mstr record is available. (91)', Severity.Error, 91],
    ['SYSTEM ERROR: Memory violation. (49)', Severity.Fatal, 49],
    ['** WARNING: -nb exceeded. (1234)', Severity.Warning, 1234],
    ['Connected to database qaddb (15321)', Severity.Info, null],
    ['Procedure complete.', Severity.Info, null],
  ])('%s', (msg, sev, no) => {
    expect(classifyMessage(msg)).toEqual({ severity: sev, errorNo: no })
  })
})
