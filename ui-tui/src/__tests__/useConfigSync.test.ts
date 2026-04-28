import { beforeEach, describe, expect, it, vi } from 'vitest'

import { $uiState, resetUiState } from '../app/uiStore.js'
import { applyDisplay, normalizeIndicatorStyle, normalizeStatusBar } from '../app/useConfigSync.js'

describe('applyDisplay', () => {
  beforeEach(() => {
    resetUiState()
  })

  it('fans every display flag out to $uiState and the bell callback', () => {
    const setBell = vi.fn()

    applyDisplay(
      {
        config: {
          display: {
            bell_on_complete: true,
            details_mode: 'expanded',
            inline_diffs: false,
            show_cost: true,
            show_reasoning: true,
            streaming: false,
            tui_compact: true,
            tui_statusbar: false
          }
        }
      },
      setBell
    )

    const s = $uiState.get()
    expect(setBell).toHaveBeenCalledWith(true)
    expect(s.compact).toBe(true)
    expect(s.detailsMode).toBe('expanded')
    expect(s.inlineDiffs).toBe(false)
    expect(s.showCost).toBe(true)
    expect(s.showReasoning).toBe(true)
    expect(s.statusBar).toBe('off')
    expect(s.streaming).toBe(false)
  })

  it('coerces legacy true + "on" alias to top', () => {
    const setBell = vi.fn()

    applyDisplay({ config: { display: { tui_statusbar: true as unknown as 'on' } } }, setBell)
    expect($uiState.get().statusBar).toBe('top')

    applyDisplay({ config: { display: { tui_statusbar: 'on' } } }, setBell)
    expect($uiState.get().statusBar).toBe('top')
  })

  it('applies v1 parity defaults when display fields are missing', () => {
    const setBell = vi.fn()

    applyDisplay({ config: { display: {} } }, setBell)

    const s = $uiState.get()
    expect(setBell).toHaveBeenCalledWith(false)
    expect(s.inlineDiffs).toBe(true)
    expect(s.showCost).toBe(false)
    expect(s.showReasoning).toBe(false)
    expect(s.statusBar).toBe('top')
    expect(s.streaming).toBe(true)
    expect(s.sections).toEqual({})
  })

  it('parses display.sections into per-section overrides', () => {
    const setBell = vi.fn()

    applyDisplay(
      {
        config: {
          display: {
            details_mode: 'collapsed',
            sections: {
              activity: 'hidden',
              tools: 'expanded',
              thinking: 'expanded',
              bogus: 'expanded'
            }
          }
        }
      },
      setBell
    )

    const s = $uiState.get()
    expect(s.detailsMode).toBe('collapsed')
    expect(s.sections).toEqual({
      activity: 'hidden',
      tools: 'expanded',
      thinking: 'expanded'
    })
  })

  it('drops invalid section modes', () => {
    const setBell = vi.fn()

    applyDisplay(
      {
        config: {
          display: {
            sections: { tools: 'maximised' as unknown as string, activity: 'hidden' }
          }
        }
      },
      setBell
    )

    expect($uiState.get().sections).toEqual({ activity: 'hidden' })
  })

  it('treats a null config like an empty display block', () => {
    const setBell = vi.fn()

    applyDisplay(null, setBell)

    const s = $uiState.get()
    expect(setBell).toHaveBeenCalledWith(false)
    expect(s.inlineDiffs).toBe(true)
    expect(s.streaming).toBe(true)
  })

  it('accepts the new string statusBar modes', () => {
    const setBell = vi.fn()

    applyDisplay({ config: { display: { tui_statusbar: 'bottom' } } }, setBell)
    expect($uiState.get().statusBar).toBe('bottom')

    applyDisplay({ config: { display: { tui_statusbar: 'top' } } }, setBell)
    expect($uiState.get().statusBar).toBe('top')
  })
})

describe('normalizeStatusBar', () => {
  it('maps legacy bool + on alias to top/off', () => {
    expect(normalizeStatusBar(true)).toBe('top')
    expect(normalizeStatusBar(false)).toBe('off')
    expect(normalizeStatusBar('on')).toBe('top')
  })

  it('passes through the canonical enum', () => {
    expect(normalizeStatusBar('off')).toBe('off')
    expect(normalizeStatusBar('top')).toBe('top')
    expect(normalizeStatusBar('bottom')).toBe('bottom')
  })

  it('defaults missing/unknown values to top', () => {
    expect(normalizeStatusBar(undefined)).toBe('top')
    expect(normalizeStatusBar(null)).toBe('top')
    expect(normalizeStatusBar('sideways')).toBe('top')
    expect(normalizeStatusBar(42)).toBe('top')
  })

  it('trims whitespace and folds case', () => {
    expect(normalizeStatusBar(' Bottom ')).toBe('bottom')
    expect(normalizeStatusBar('TOP')).toBe('top')
    expect(normalizeStatusBar('  on  ')).toBe('top')
    expect(normalizeStatusBar('OFF')).toBe('off')
  })
})

describe('normalizeIndicatorStyle', () => {
  it('passes through the canonical enum', () => {
    expect(normalizeIndicatorStyle('kaomoji')).toBe('kaomoji')
    expect(normalizeIndicatorStyle('emoji')).toBe('emoji')
    expect(normalizeIndicatorStyle('unicode')).toBe('unicode')
    expect(normalizeIndicatorStyle('ascii')).toBe('ascii')
  })

  it('trims and lowercases input', () => {
    expect(normalizeIndicatorStyle(' Emoji ')).toBe('emoji')
    expect(normalizeIndicatorStyle('UNICODE')).toBe('unicode')
  })

  it('defaults to kaomoji for missing/unknown values', () => {
    expect(normalizeIndicatorStyle(undefined)).toBe('kaomoji')
    expect(normalizeIndicatorStyle(null)).toBe('kaomoji')
    expect(normalizeIndicatorStyle('')).toBe('kaomoji')
    expect(normalizeIndicatorStyle('sparkle')).toBe('kaomoji')
    expect(normalizeIndicatorStyle(42)).toBe('kaomoji')
  })
})

describe('applyDisplay → tui_status_indicator', () => {
  beforeEach(() => {
    resetUiState()
  })

  it('threads display.tui_status_indicator into $uiState', () => {
    const setBell = vi.fn()

    applyDisplay({ config: { display: { tui_status_indicator: 'emoji' } } }, setBell)
    expect($uiState.get().indicatorStyle).toBe('emoji')

    applyDisplay({ config: { display: { tui_status_indicator: 'unicode' } } }, setBell)
    expect($uiState.get().indicatorStyle).toBe('unicode')
  })

  it('falls back to kaomoji default when missing or invalid', () => {
    const setBell = vi.fn()

    applyDisplay({ config: { display: {} } }, setBell)
    expect($uiState.get().indicatorStyle).toBe('kaomoji')

    applyDisplay({ config: { display: { tui_status_indicator: 'rainbow' } } }, setBell)
    expect($uiState.get().indicatorStyle).toBe('kaomoji')
  })
})
