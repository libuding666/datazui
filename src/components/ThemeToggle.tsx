import { Moon, Sun } from '@appica/icons-react'
import { Button } from '@appica/ui-react/button'
import { useTheme } from '@appica/ui-react/hooks/use-theme'

export function ThemeToggle() {
  const { resolvedTheme, setTheme, mounted } = useTheme()

  if (!mounted) {
    return <Button variant="ghost" size="icon-md" aria-label="切换深浅色" />
  }

  const dark = resolvedTheme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon-md"
      aria-label={dark ? '切换到浅色模式' : '切换到深色模式'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
    </Button>
  )
}
