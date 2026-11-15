import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { Cover } from '../../components/Cover'
import { useCloud } from '../../hooks/cloud'
import type { ProfileItem } from '../../lib/profile'
import { CopySheet } from '../profile/CopySheet'

type Added = { username: string; key: string; item: ProfileItem }
const SHOWN = 12

// The newest records from the people you follow, as a row of covers that scrolls sideways, with the
// whole list a tap away. Nothing at all until someone you follow has added something.
export function NewFromFollowing() {
  const { api } = useCloud()
  const [added, setAdded] = useState<Added[] | null>(null)
  const [more, setMore] = useState(false)
  const [open, setOpen] = useState<Added | null>(null)

  useEffect(() => {
    if (!api) return
    api
      .feed()
      .then((page) => {
        setAdded(page.items.slice(0, SHOWN).map((i) => ({ username: i.username, key: i.key, item: JSON.parse(i.value) as ProfileItem })))
        setMore(page.more || page.items.length > SHOWN)
      })
      .catch(() => setAdded([]))
  }, [api])

  if (!added?.length) return null
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-xs font-semibold tracking-wide text-stone-500 uppercase">New from people you follow</h2>
        {(more || added.length > 3) && (
          <Link href="/following" className="text-sm text-stone-500 hover:text-stone-900 dark:hover:text-stone-100">
            See all
          </Link>
        )}
      </div>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:px-0">
        {added.map((a) => {
          const tile = (
            <>
              <Cover item={a.item} className="aspect-square w-full rounded-xl shadow-sm ring-1 ring-black/5" />
              <p className="mt-1.5 truncate text-sm font-medium">{a.item.title}</p>
              <p className="truncate text-xs text-stone-500">{a.username}</p>
            </>
          )
          return (
            <li key={`${a.username}:${a.key}`} className="w-28 shrink-0">
              {/* their copy first when they show details about it, as on their profile */}
              {a.item.copy ? (
                <button type="button" onClick={() => setOpen(a)} className="block w-full text-left">
                  {tile}
                </button>
              ) : (
                <Link href={`/release/${a.item.id}`} className="block">
                  {tile}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
      {open && <CopySheet item={open.item} owner={open.username} onClose={() => setOpen(null)} />}
    </section>
  )
}
