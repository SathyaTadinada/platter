import type { OwnedItem, WantItem } from '../db/db'

export type Ownership = {
  exactCopies: number // copies of this exact release
  otherPressings: number // copies of other releases from the same master
  inWantlist: boolean
  wantsOtherPressing: boolean
}

export function computeOwnership(releaseId: number, masterId: number | undefined, owned: OwnedItem[], wants: WantItem[]): Ownership {
  const sameMaster = (m: number) => Boolean(masterId) && m === masterId
  return {
    exactCopies: owned.filter((o) => o.releaseId === releaseId).length,
    otherPressings: owned.filter((o) => o.releaseId !== releaseId && sameMaster(o.masterId)).length,
    inWantlist: wants.some((w) => w.releaseId === releaseId),
    wantsOtherPressing: wants.some((w) => w.releaseId !== releaseId && sameMaster(w.masterId)),
  }
}
