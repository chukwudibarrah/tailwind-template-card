import { ConfigState } from '@types'
import { useCallback, useEffect, useRef } from 'preact/hooks'

/** Native events forwarded to the card's action handler. */
export const FORWARDED_EVENTS = [
  'click',
  'dblclick',
  'change',
  'input',
  'contextmenu'
] as const

/** How long a pointer must be held before a `hold` action fires. */
const HOLD_DURATION_MS = 500
/** Pointer travel beyond this cancels a hold (it's a scroll, not a press). */
const HOLD_MOVE_TOLERANCE_PX = 10

export function HaCard ({
  htmlContent,
  config,
  onEvent
}: {
  htmlContent: string
  config: ConfigState
  onEvent: (e: Event) => void
}) {
  const theme = config.plugins.daisyui.theme ?? 'inherit - inherit'
  const [scheme, themeName] = theme.split(' - ')
  const attributes = ['inherit', 'auto', 'inherit - inherit'].includes(theme)
    ? {}
    : { 'data-theme': themeName }
  const unsetBackgroundStyles = { background: 'unset', color: 'unset' }

  const containerRef = useRef<HTMLDivElement | null>(null)

  // Keep the latest handler without re-binding listeners on every render.
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  const dispatch = useCallback((e: Event) => handlerRef.current(e), [])

  useEffect(() => {
    const container = containerRef.current
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
      container.removeEventListener('hold', dispatch, true)
      container.removeEventListener('pointerdown', onPointerDown, true)
      container.removeEventListener('pointermove', onPointerMove, true)
      container.removeEventListener('pointerup', onPointerUp, true)
      container.removeEventListener('pointercancel', onPointerUp, true)
      container.removeEventListener('click', onClickCapture, true)
    }
  }, [dispatch])

  return (
    <>
      {/* @ts-expect-error tag <ha-card> is not native */}
      <ha-card>
        <div
          ref={containerRef}
          className={scheme}
          style={
            config.plugins.daisyui.overrideCardBackground
              ? {}
              : unsetBackgroundStyles
          }
          {...attributes}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
        {/* @ts-expect-error <ha-card> is not native */}
      </ha-card>
    </>
  )
}
