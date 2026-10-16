import { Disc3 } from 'lucide-react'
import type { LibraryItem } from '../db/db'

export function Cover({
  item,
  className = '',
  small,
}: {
  item: Pick<LibraryItem, 'cover' | 'thumb'>
  className?: string
  small?: boolean
}) {
  const src = small ? (item.thumb ?? item.cover) : (item.cover ?? item.thumb)
  return src ? (
    <img src={src} alt="" loading="lazy" decoding="async" className={`bg-stone-200 object-cover dark:bg-stone-800 ${className}`} />
  ) : (
    <div className={`flex items-center justify-center bg-stone-200 text-stone-400 dark:bg-stone-800 ${className}`}>
      <Disc3 size={small ? 20 : 40} aria-hidden />
    </div>
  )
}
