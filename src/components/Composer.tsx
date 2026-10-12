import * as React from 'react'
import { CircleCheckFilled, Mask, Send, UserFilled } from '@appica/icons-react'
import { Button } from '@appica/ui-react/button'
import { Chip } from '@appica/ui-react/chip'
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@appica/ui-react/drawer'
import { Field, FieldDescription, FieldLabel } from '@appica/ui-react/field'
import { Input } from '@appica/ui-react/input'
import { Switch } from '@appica/ui-react/switch'
import { Textarea } from '@appica/ui-react/textarea'
import { useToastManager } from '@appica/ui-react/toast'
import { BRAG_TAGS, MAX_LEN, SCENES, type BragTag } from '../data/brags'
import { cn } from '../lib/cn'
import type { PublishInput } from '../lib/useWall'
import { TagIcon } from './TagIcon'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPublish: (input: PublishInput) => void
}

const MIN_LEN = 4

export function Composer({ open, onOpenChange, onPublish }: Props) {
  const toast = useToastManager<{ icon?: React.ReactNode }>()

  const [text, setText] = React.useState('')
  const [tag, setTag] = React.useState<BragTag>('遥遥领先')
  const [scene, setScene] = React.useState<string>(SCENES[0])
  const [anonymous, setAnonymous] = React.useState(true)
  const [author, setAuthor] = React.useState('')
  const [error, setError] = React.useState('')

  const trimmed = text.trim()
  const canSubmit = trimmed.length >= MIN_LEN

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) {
      setError(`再写两个字吧，至少 ${MIN_LEN} 个字`)
      return
    }

    onPublish({
      text: trimmed,
      tag,
      scene,
      author: anonymous ? null : author,
    })

    toast.add({
      title: anonymous ? '已匿名上墙' : '已上墙',
      description: '感谢你为反吹牛事业添砖加瓦。',
      data: { icon: <CircleCheckFilled className="text-success-emphasis" /> },
    })

    setText('')
    setAuthor('')
    setAnonymous(true)
    setError('')
    onOpenChange(false)
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} side="bottom">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>补一句你刚听到的</DrawerTitle>
          <DrawerDescription>会上讲的、群里转的、朋友吹的，都能贴上来。默认匿名。</DrawerDescription>
        </DrawerHeader>

        <DrawerBody>
          <form id="dz-compose" onSubmit={handleSubmit} className="flex flex-col gap-6 pb-2">
            <Field>
              <FieldLabel>吹牛原话</FieldLabel>
              <Textarea
                value={text}
                onChange={(event) => {
                  setText(event.target.value.slice(0, MAX_LEN))
                  if (error) setError('')
                }}
                rows={3}
                placeholder="例如：我们这个技术，放到全球范围内，遥遥领先。"
                aria-invalid={error ? true : undefined}
              />
              <FieldDescription className={error ? 'text-error-emphasis' : undefined}>
                {error || (
                  <span className="tabular-nums">
                    越具体越好，把出处也写出来更带感。还可以写 {Math.max(0, MAX_LEN - text.length)} 字。
                  </span>
                )}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>归到哪一类</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {BRAG_TAGS.map((item) => (
                  <Chip
                    key={item}
                    type="button"
                    variant={tag === item ? 'primary' : 'soft'}
                    onClick={() => setTag(item)}
                  >
                    <TagIcon tag={item} data-icon="start" />
                    {item}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field>
              <FieldLabel>在哪儿吹的</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {SCENES.map((item) => (
                  <Chip
                    key={item}
                    type="button"
                    size="sm"
                    variant={scene === item ? 'secondary' : 'outline'}
                    onClick={() => setScene(item)}
                    className={cn(scene === item && 'font-semibold')}
                  >
                    {item}
                  </Chip>
                ))}
              </div>
            </Field>

            <div className="border-border bg-background-subtle rounded-xl border p-4">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span className="flex items-center gap-2.5">
                  <span className="bg-background-muted text-foreground-muted grid size-8 shrink-0 place-items-center rounded-lg">
                    {anonymous ? <Mask className="size-4" /> : <UserFilled className="size-4" />}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-foreground-intense text-sm font-semibold">匿名发布</span>
                    <span className="text-foreground-muted text-xs">
                      {anonymous ? '谁也不知道是你说的' : '会带上你填的昵称'}
                    </span>
                  </span>
                </span>
                <Switch checked={anonymous} onCheckedChange={setAnonymous} />
              </label>

              {!anonymous ? (
                <div className="mt-4">
                  <Field>
                    <FieldLabel>昵称</FieldLabel>
                    <Input
                      value={author}
                      maxLength={16}
                      onChange={(event) => setAuthor(event.target.value.slice(0, 16))}
                      placeholder="留空也会按匿名处理"
                      startSlot={<UserFilled />}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          </form>
        </DrawerBody>

        <DrawerFooter className="dz-safe-b">
          <DrawerClose render={<Button type="button" variant="outline" size="lg" />}>先不写了</DrawerClose>
          <Button type="submit" form="dz-compose" size="lg" disabled={!canSubmit} focusableWhenDisabled>
            <Send data-icon="start" />
            发到墙上
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
