import { describe, expect, it } from 'vitest'

describe('forceTruecolor', () => {
  it('sets COLORTERM=truecolor and FORCE_COLOR=3 when unset', async () => {
    const prev = {
      COLORTERM: process.env.COLORTERM,
      FORCE_COLOR: process.env.FORCE_COLOR,
      HERMES_TUI_TRUECOLOR: process.env.HERMES_TUI_TRUECOLOR
    }

    delete process.env.COLORTERM
    delete process.env.FORCE_COLOR
    delete process.env.HERMES_TUI_TRUECOLOR

    await import('../lib/forceTruecolor.js?t=' + Date.now())

    expect(process.env.COLORTERM).toBe('truecolor')
    expect(process.env.FORCE_COLOR).toBe('3')

    if (prev.COLORTERM === undefined) delete process.env.COLORTERM
    else process.env.COLORTERM = prev.COLORTERM

    if (prev.FORCE_COLOR === undefined) delete process.env.FORCE_COLOR
    else process.env.FORCE_COLOR = prev.FORCE_COLOR

    if (prev.HERMES_TUI_TRUECOLOR === undefined) delete process.env.HERMES_TUI_TRUECOLOR
    else process.env.HERMES_TUI_TRUECOLOR = prev.HERMES_TUI_TRUECOLOR
  })

  it('respects HERMES_TUI_TRUECOLOR=0 opt-out', async () => {
    const prev = {
      COLORTERM: process.env.COLORTERM,
      FORCE_COLOR: process.env.FORCE_COLOR,
      HERMES_TUI_TRUECOLOR: process.env.HERMES_TUI_TRUECOLOR
    }

    delete process.env.COLORTERM
    delete process.env.FORCE_COLOR
    process.env.HERMES_TUI_TRUECOLOR = '0'

    await import('../lib/forceTruecolor.js?t=optout-' + Date.now())

    expect(process.env.COLORTERM).toBeUndefined()
    expect(process.env.FORCE_COLOR).toBeUndefined()

    if (prev.COLORTERM === undefined) delete process.env.COLORTERM
    else process.env.COLORTERM = prev.COLORTERM

    if (prev.FORCE_COLOR === undefined) delete process.env.FORCE_COLOR
    else process.env.FORCE_COLOR = prev.FORCE_COLOR

    if (prev.HERMES_TUI_TRUECOLOR === undefined) delete process.env.HERMES_TUI_TRUECOLOR
    else process.env.HERMES_TUI_TRUECOLOR = prev.HERMES_TUI_TRUECOLOR
  })
})
