import { describe, expect, it } from 'vitest'
import { Severity } from '@shared/types'
import { ClientLogParser } from '../../src/main/parsers/clientLogParser'
import { parseFile, parseLines, sampleOf } from '../helpers'

const p = new ClientLogParser()

describe('ClientLogParser.detect', () => {
  it('scores a client log highly', async () => {
    expect(p.detect(await sampleOf('clientlog-4gltrace.log'))).toBeGreaterThan(0.9)
  })
  it('accepts 4-digit-year stamps', async () => {
    expect(p.detect(await sampleOf('clientlog-messages.log'))).toBeGreaterThan(0.9)
  })
  it('rejects other formats', async () => {
    expect(p.detect(await sampleOf('unknown-app.log'))).toBe(0)
  })
})

describe('ClientLogParser.parse - header', () => {
  it('parses timestamp, pid, thread, level and entry type', async () => {
    const [e] = await parseLines(p, [
      '[26/10/12@10:15:22.123+0530] P-012345 T-000001 4 4GL 4GLTRACE  Run xxpo.p "1001" [Main Block - xxmain.p @ 245]',
    ])
    expect(e.ts).toBe(Date.UTC(2026, 9, 12, 4, 45, 22, 123)) // 10:15:22.123 IST = 04:45:22.123 UTC
    expect(e.tsRaw).toBe('26/10/12@10:15:22.123+0530')
    expect(e.pid).toBe(12345)
    expect(e.tid).toBe(1)
    expect(e.level).toBe(4)
    expect(e.entryType).toBe('4GLTRACE')
    expect(e.lineNo).toBe(1)
  })
})

describe('ClientLogParser.parse - 4GLTrace', () => {
  it('parses the spec example line exactly', async () => {
    const [e] = await parseLines(p, [
      '[26/10/12@10:15:22.123+0530] P-012345 T-000001 4 4GL 4GLTRACE  Run xxpo.p "1001" [Main Block - xxmain.p @ 245]',
    ])
    expect(e).toMatchObject({
      action: 'Run',
      target: 'xxpo.p',
      args: '"1001"',
      callerProc: 'Main Block',
      callerFile: 'xxmain.p',
      callerLine: 245,
      severity: Severity.Trace,
      errorNo: null,
    })
  })

  it('handles Return / Func / Publish / Subscribe / Invoke', async () => {
    const all = await parseFile(p, 'clientlog-4gltrace.log')
    const trace = all.filter((e) => e.entryType === '4GLTRACE')
    expect(trace.map((e) => e.action)).toEqual([
      'Run', 'Run', 'Run', 'Func', 'Return', 'Return', 'Publish', 'Subscribe', 'Invoke', 'Return', 'Return',
    ])
    const ret = trace[4]
    expect(ret).toMatchObject({ action: 'Return', target: 'getPartDesc', callerFile: 'xxpo.p', callerProc: null, callerLine: null })
    const fn = trace[3]
    expect(fn).toMatchObject({ target: 'getPartDesc', args: '"10-1000"', callerProc: 'validate-part', callerLine: 131 })
    expect(trace[6].target).toBe('PoUpdated') // quoted target is unquoted
    expect(trace[8].target).toBe('Qad.Po.Service:Save')
    expect(trace[9].target).toBe('Main Block') // "Return from Main Block [xxpo.p]"
    expect(trace[9].args).toBeNull()
    expect(trace[9].callerFile).toBe('xxpo.p')
  })
})

describe('ClientLogParser.parse - 4GLMessages', () => {
  it('extracts error number and procedure location', async () => {
    const all = await parseFile(p, 'clientlog-4gltrace.log')
    const err = all.find((e) => e.errorNo === 91)!
    expect(err).toBeDefined()
    expect(err.severity).toBe(Severity.Error)
    expect(err.entryType).toBe('4GLMESSAGE')
    expect(err.callerProc).toBe('validate-part')
    expect(err.callerFile).toBe('xxpo.p')
    expect(err.callerLine).toBe(142)
    expect(err.lineNo).toBe(11)
  })

  it('classifies "--" lines and pulls each error number', async () => {
    const all = await parseFile(p, 'clientlog-messages.log')
    expect(all).toHaveLength(6)
    expect(all.map((e) => e.errorNo)).toEqual([132, 138, 142, 26, null, 2624])
    expect(all[4].severity).toBe(Severity.Info)
    expect(all.filter((e) => e.severity === Severity.Error)).toHaveLength(5)
    expect(all[0].ts).toBe(Date.UTC(2026, 9, 12, 9, 0, 1))
  })

  it('folds stack-trace continuation lines into the previous entry', async () => {
    const all = await parseFile(p, 'clientlog-4gltrace.log')
    const sys = all.find((e) => e.errorNo === 49)!
    expect(sys.severity).toBe(Severity.Fatal)
    expect(sys.raw.split('\n')).toHaveLength(4)
    expect(sys.message).toContain('xxpo.p line 245')
    expect(all.at(-1)!.lineNo).toBe(24) // blank line skipped, numbering preserved
  })

  it('marks warnings and debug entry types', async () => {
    const all = await parseFile(p, 'clientlog-4gltrace.log')
    expect(all.find((e) => e.message.startsWith('WARNING'))!.severity).toBe(Severity.Warning)
    expect(all.find((e) => e.entryType === 'FILEID')!.severity).toBe(Severity.Debug)
    expect(all.find((e) => e.entryType === 'QRYINFO')!.severity).toBe(Severity.Debug)
    expect(all.find((e) => e.entryType === 'DB.CONNECTS')!.errorNo).toBeNull() // "(15321)" in an info line is not an error
    expect(all.find((e) => e.errorNo === 915)!.severity).toBe(Severity.Error)
  })
})

describe('chunking', () => {
  it('gives identical results with tiny read chunks (lines split across reads)', async () => {
    const big = await parseFile(p, 'clientlog-4gltrace.log')
    const tiny = await parseFile(p, 'clientlog-4gltrace.log', 7)
    expect(tiny).toEqual(big)
  })
})
