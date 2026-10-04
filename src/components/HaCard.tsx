import { ConfigState } from '@types'
import type { RefObject } from 'preact'
import { useCallback, useEffect, useRef } from 'preact/hooks'
import { FOLLOW_HA_THEME } from '@store/configDefaults'

/** Native events forwarded to the card's action handler. */
export const FORWARDED_EVENTS = [
  'click',
  'dblclick',
  'change',
  'input',
  'contextmenu'
] as const

/**
 * Neutralises `ha-card`'s own surface through the custom properties it reads,
 * which is the supported way to restyle it.
 *
 * `overrideCardBackground` only unsets the inner wrapper's background, leaving
 * Home Assistant's card still painted underneath — so content that supplies its
 * own surface sat on top of a stray panel. card-mod cannot help here either:
 * it injects a <style> element into the card's shadow root, and this card
 * clears that root on every render.
 */
const BARE_CARD_STYLE = [
  '--ha-card-background: transparent',
  '--ha-card-box-shadow: none',
  '--ha-card-border-width: 0px',
  '--ha-card-border-radius: 0px'
].join(';')

/**
 * Elements that already turn Enter/Space into a click, or need those keys for
 * typing. Keyboard activation is only synthesised for everything else.
 */
const NATIVE_KEYBOARD =
  'button, a[href], input, select, textarea, summary, [contenteditable=""], [contenteditable="true"]'

/** Opted-in custom controls: `<div role="button" tabindex="0">`. */
const KEYBOARD_ACTIVATABLE = '[role="button"], [tabindex]'

/**
 * `data-theme` and scheme class for the content, from the configured theme.
 *
 * `auto` follows Home Assistant's own light/dark mode. It used to default to a
 * fixed `dark - dark`, so daisyUI components painted dark on a light dashboard.
 */
export const resolveTheme = (theme: string | undefined, darkMode: boolean) => {
  const value = theme ?? FOLLOW_HA_THEME
  if (value === FOLLOW_HA_THEME) {
    const scheme = darkMode ? 'dark' : 'light'
    return { scheme, attributes: { 'data-theme': scheme } }
  }
  if (value === 'inherit' || value === 'inherit - inherit') {
    return { scheme: 'inherit', attributes: {} }
  }
  const [scheme, themeName] = value.split(' - ')
  return { scheme, attributes: { 'data-theme': themeName ?? scheme } }
}

/** How long a pointer must be held before a `hold` action fires. */
const HOLD_DURATION_MS = 500
/** Pointer travel beyond this cancels a hold (it's a scroll, not a press). */
const HOLD_MOVE_TOLERANCE_PX = 10

/**
 * The card's persistent shell: `ha-card` and the content container.
 *
 * The content itself is not rendered here. The card morphs it into
 * `contentRef` so that an update changes only what changed — a full re-render
 * dropped focus, reset a slider mid-drag and made CSS transitions impossible.
 */
export function HaCard ({
  config,
  darkMode,
  error,
  contentRef,
  onEvent
}: {
  config: ConfigState
  darkMode: boolean
  /** Template error to show above the last good render. */
  error: string | null
  contentRef: RefObject<HTMLDivElement>
  onEvent: (e: Event) => void
}) {
  const { scheme, attributes } = resolveTheme(
    config.plugins.daisyui.theme,
    darkMode
  )
  const unsetBackgroundStyles = { background: 'unset', color: 'unset' }

  // Keep the latest handler without re-binding listeners on every render.
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  const dispatch = useCallback((e: Event) => handlerRef.current(e), [])

  useEffect(() => {
    const container = contentRef.current
    if (!container) return

    FORWARDED_EVENTS.forEach((type) =>
      container.addEventListener(type, dispatch, true)
    )

    // Synthesise `hold` from pointer events so cards can offer press-and-hold
    // the way Home Assistant's own cards do. A completed hold suppresses the
    // click that would otherwise follow it.
    let timer: number | null = null
    let origin: { x: number; y: number } | null = null
    let held = false

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return

      held = false
      origin = { x: e.clientX, y: e.clientY }

      clearTimer()
      timer = window.setTimeout(() => {
        timer = null
        held = true
        target.dispatchEvent(
          new CustomEvent('hold', { bubbles: true, composed: true })
        )
      }, HOLD_DURATION_MS)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (timer === null || !origin) return
      const travelled =
        Math.abs(e.clientX - origin.x) + Math.abs(e.clientY - origin.y)
      if (travelled > HOLD_MOVE_TOLERANCE_PX) clearTimer()
    }

    const onPointerUp = () => {
      clearTimer()
      origin = null
    }

    const onClickCapture = (e: Event) => {
      if (!held) return
      // The press already fired a `hold`; don't also fire the click action.
      held = false
      e.stopPropagation()
      e.preventDefault()
    }

    // Custom controls opted in with `role="button"` or `tabindex` answer
    // Enter and Space the way a native button would.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      if (e.defaultPrevented || e.repeat) return
      const target = e.target
      if (!(target instanceof HTMLElement)) return
      if (target.matches(NATIVE_KEYBOARD)) return
      if (!target.matches(KEYBOARD_ACTIVATABLE)) return
      e.preventDefault()
      target.click()
    }

    container.addEventListener('keydown', onKeyDown)
    container.addEventListener('hold', dispatch, true)
    container.addEventListener('pointerdown', onPointerDown, true)
    container.addEventListener('pointermove', onPointerMove, true)
    container.addEventListener('pointerup', onPointerUp, true)
    container.addEventListener('pointercancel', onPointerUp, true)
    // Registered before `dispatch` runs so a held press can cancel its click.
    container.addEventListener('click', onClickCapture, true)

    return () => {
      clearTimer()
      FORWARDED_EVENTS.forEach((type) =>
        container.removeEventListener(type, dispatch, true)
      )
      container.removeEventListener('keydown', onKeyDown)
      container.removeEventListener('hold', dispatch, true)
      container.removeEventListener('pointerdown', onPointerDown, true)
      container.removeEventListener('pointermove', onPointerMove, true)
      container.removeEventListener('pointerup', onPointerUp, true)
      container.removeEventListener('pointercancel', onPointerUp, true)
      container.removeEventListener('click', onClickCapture, true)
    }
  }, [dispatch, contentRef])

  return (
    <>
      {/* @ts-expect-error tag <ha-card> is not native */}
      <ha-card style={config.bare ? BARE_CARD_STYLE : undefined}>
        {error && (
          // @ts-expect-error <ha-alert> is not native
          <ha-alert key='error' alert-type='error' style='display: block'>
            {error}
            {/* @ts-expect-error <ha-alert> is not native */}
          </ha-alert>
        )}
        <div
          key='content'
          ref={contentRef}
          className={scheme}
          style={
            config.plugins.daisyui.overrideCardBackground
              ? {}
              : unsetBackgroundStyles
          }
          {...attributes}
        />
        {/* @ts-expect-error <ha-card> is not native */}
      </ha-card>
    </>
  )
}
