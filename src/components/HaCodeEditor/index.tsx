import { useEffect, useRef, useState } from 'preact/hooks'
import { TextareaEditor } from '@components/TextareaEditor'

/**
 * The subset of `ha-code-editor`'s API this wrapper drives.
 *
 * Home Assistant supports two modes only — `yaml` and `jinja2` (the latter is
 * Jinja layered on a YAML base). There is no HTML or JavaScript mode.
 */
type HaCodeEditorElement = HTMLElement & {
  value: string
  mode: string
  autocompleteEntities: boolean
  autocompleteIcons: boolean
  linewrap: boolean
  hasToolbar: boolean
  disableFullscreen: boolean
  readOnly: boolean
}

const ELEMENT_NAME = 'ha-code-editor'

/** How long to wait for Home Assistant to lazily register its editor. */
const DEFINITION_TIMEOUT_MS = 4000

/**
 * Wraps Home Assistant's own CodeMirror editor.
 *
 * Using the frontend's editor rather than bundling one means the card picks up
 * entity autocompletion, the active Home Assistant theme, and the same
 * keybindings as every other YAML field — at no bundle cost, since the element
 * already ships with the frontend.
 *
 * `ha-code-editor` sources its entity list through Lit context rather than a
 * `hass` property. Those `context-request` events are composed, so they cross
 * the card's shadow boundary and reach Home Assistant's provider unaided.
 *
 * The element is registered lazily by the frontend, so until it exists this
 * falls back to a plain textarea and upgrades in place once it appears.
 */
export function HaCodeEditor ({
  defaultValue,
  onChange,
  mode = 'jinja2',
  linewrap = true,
  className
}: {
  defaultValue: string
  onChange: (value: string) => void
  mode?: string
  linewrap?: boolean
  className?: string
}) {
  const [available, setAvailable] = useState(
    () => Boolean(customElements.get(ELEMENT_NAME))
  )
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<HaCodeEditorElement | null>(null)

  // Keep the latest callback without re-creating the editor on every render.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (available) return

    let cancelled = false
    const timeout = window.setTimeout(() => {
      cancelled = true
    }, DEFINITION_TIMEOUT_MS)

    customElements.whenDefined(ELEMENT_NAME).then(() => {
      window.clearTimeout(timeout)
      if (!cancelled) setAvailable(true)
    })

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [available])

  useEffect(() => {
    const container = containerRef.current
    if (!available || !container) return

    const editor = document.createElement(ELEMENT_NAME) as HaCodeEditorElement
    editor.mode = mode
    editor.value = defaultValue ?? ''
    editor.autocompleteEntities = true
    editor.autocompleteIcons = true
    editor.linewrap = linewrap
    editor.hasToolbar = false
    editor.disableFullscreen = true
    editor.style.height = '100%'
    editor.style.display = 'block'

    const handleChange = (e: Event) => {
      const detail = (e as CustomEvent<{ value: string }>).detail
      const value = detail?.value ?? editor.value
      onChangeRef.current(value)
    }

    editor.addEventListener('value-changed', handleChange)

    container.innerHTML = ''
    container.appendChild(editor)
    editorRef.current = editor

    return () => {
      editor.removeEventListener('value-changed', handleChange)
      editor.remove()
      editorRef.current = null
    }
    // `defaultValue` is deliberately excluded from the dependencies: it seeds
    // the editor, and re-running this on every keystroke would rebuild the
    // element and destroy the caret. External changes are handled below.
  }, [available, mode, linewrap])

  // Adopt external changes (e.g. a different card loaded into the editor)
  // without disturbing the caret while the user is typing.
  useEffect(() => {
    const editor = editorRef.current
    if (editor && defaultValue !== undefined && editor.value !== defaultValue) {
      editor.value = defaultValue
    }
  }, [defaultValue])

  if (!available) {
    return (
      <TextareaEditor
        defaultValue={defaultValue}
        onChange={onChange}
        className={className}
      />
    )
  }

  return <div class={className} style={{ height: '100%' }} ref={containerRef} />
}
