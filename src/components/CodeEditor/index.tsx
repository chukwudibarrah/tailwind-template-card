import clsx from 'clsx'
import { HaCodeEditor } from '@components/HaCodeEditor'

export function CodeEditor ({
  defaultValue,
  onChange,
  className,
  mode = 'jinja2',
  html = true
}: {
  defaultValue: string
  onChange: (defaultValue: string) => void
  className?: string
  mode?: string
  html?: boolean
}) {
  return (
    /*
     * `ha-code-editor` sizes itself to its content — its host style is only
     * `display: block`, and CodeMirror's own scroller never gets a bounded
     * height. Left alone it grows past its container and paints over whatever
     * follows it, which is what put the Bindings and Actions panels on top of
     * the code. Capping the height here and scrolling makes it behave.
     */
    <HaCodeEditor
      defaultValue={defaultValue}
      onChange={onChange}
      mode={mode}
      html={html}
      className={clsx(
        'w-full min-h-32 max-h-[420px] overflow-auto rounded-lg',
        className
      )}
    />
  )
}
