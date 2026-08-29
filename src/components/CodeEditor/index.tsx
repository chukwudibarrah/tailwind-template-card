import clsx from 'clsx'
import { HaCodeEditor } from '@components/HaCodeEditor'

export function CodeEditor ({
  defaultValue,
  onChange,
  className,
  mode = 'jinja2'
}: {
  defaultValue: string
  onChange: (defaultValue: string) => void
  className?: string
  mode?: string
}) {
  return (
    <div className={clsx('h-48 w-full', className)}>
      <HaCodeEditor defaultValue={defaultValue} onChange={onChange} mode={mode} />
    </div>
  )
}
