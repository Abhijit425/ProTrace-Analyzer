import { describe, expect, it } from 'vitest'
import { Severity } from '@shared/types'
import { GenericParser } from '../../src/main/parsers/genericParser'
import { parseFile } from '../helpers'

const p = new GenericParser()

describe('GenericParser', () => {
  it('groups Java stack traces and finds the Progress error inside', async () => {
    const all = await parseFile(p, 'unknown-app.log')
    expect(all).toHaveLength(5)
    const [info, err, warn, severe, plain] = all
    expect(info.severity).toBe(Severity.Info)
    expect(err.severity).toBe(Severity.Error)
    expect(err.errorNo).toBe(91)
    expect(err.raw.split('\n')).toHaveLength(6)
    expect(warn.severity).toBe(Severity.Warning)
    expect(severe.severity).toBe(Severity.Error)
    expect(plain.ts).toBeNull()
  })

  it('parses ISO and Tomcat timestamps (local time)', async () => {
    const all = await parseFile(p, 'unknown-app.log')
    expect(all[0].ts).toBe(new Date(2026, 9, 12, 10, 15, 21, 900).getTime())
    expect(all[3].ts).toBe(new Date(2026, 10, 2, 10, 15, 24, 500).getTime())
  })
})
