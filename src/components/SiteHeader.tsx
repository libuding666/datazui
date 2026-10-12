import { HandClick, Plus } from '@appica/icons-react'
import { Button } from '@appica/ui-react/button'
import { ThemeToggle } from './ThemeToggle'

export function SiteHeader({ onCompose }: { onCompose: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="dz-safe-t mx-auto flex h-14 max-w-2xl items-center gap-2 px-4">
        <a href="#top" className="flex items-center gap-2.5" aria-label="打他嘴 首页">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <HandClick className="size-4.5" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-black tracking-tight text-foreground-intense">打他嘴</span>
            <span className="mt-0.5 text-[10px] font-medium tracking-wide text-foreground-subtle">
              专治各种遥遥领先
            </span>
          </span>
        </a>

        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="soft" size="sm" className="hidden sm:inline-flex" onClick={onCompose}>
            <Plus data-icon="start" />
            补一句
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
