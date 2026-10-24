import type { OwnedItem, WantItem } from '../db/db'

// Shopping: a record scanned in a shop, checked against the collection and wantlist. A barcode
// can belong to several pressings, so it counts as owned if any of them is.

export type ShopCheck = {
  owned?: OwnedItem // a copy of one of the pressings with this barcode
  otherPressing?: OwnedItem // a copy of the same album on another pressing
  wanted: boolean // this pressing, or the album, is on the wantlist
}

export function shopCheck(candidates: { id: number; master_id?: number }[], owned: OwnedItem[], wants: WantItem[]): ShopCheck {
  const ids = new Set(candidates.map((c) => c.id))
  const masters = new Set(candidates.map((c) => c.master_id).filter((m): m is number => Boolean(m)))
  return {
    owned: owned.find((o) => ids.has(o.releaseId)),
    otherPressing: owned.find((o) => !ids.has(o.releaseId) && masters.has(o.masterId)),
    wanted: wants.some((w) => ids.has(w.releaseId) || masters.has(w.masterId)),
  }
}

// Scans from this visit, newest first, kept while the app is open so a look at a release and
// back doesn't lose them
const KEY = 'platter.shop'
export type Scanned = { barcode: string; at: number }

export function shopList(): Scanned[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as Scanned[]
  } catch {
    return []
  }
}

export function addToShopList(barcode: string, now = Date.now()): Scanned[] {
  const list = [{ barcode, at: now }, ...shopList().filter((s) => s.barcode !== barcode)].slice(0, 30)
  sessionStorage.setItem(KEY, JSON.stringify(list))
  return list
}

export function clearShopList() {
  sessionStorage.removeItem(KEY)
}
