import { beforeEach, describe, expect, it } from 'vitest'
import type { OwnedItem, WantItem } from '../db/db'
import { addToShopList, clearShopList, shopCheck, shopList } from './shop'

const copy = (instanceId: number, releaseId: number, masterId: number): OwnedItem => ({ instanceId, releaseId, masterId, folderId: 1 })
const want = (releaseId: number, masterId: number): WantItem => ({ releaseId, masterId })

describe('shopCheck', () => {
  const pressings = [
    { id: 1, master_id: 100 },
    { id: 2, master_id: 100 },
  ]

  it('finds a copy of any pressing with the barcode', () => {
    expect(shopCheck(pressings, [copy(9, 2, 100)], []).owned?.instanceId).toBe(9)
  })

  it('finds the album on another pressing', () => {
    const r = shopCheck(pressings, [copy(9, 3, 100), copy(8, 4, 200)], [])
    expect(r.owned).toBeUndefined()
    expect(r.otherPressing?.instanceId).toBe(9)
  })

  it('checks the wantlist by pressing and by album', () => {
    expect(shopCheck(pressings, [], [want(1, 100)]).wanted).toBe(true)
    expect(shopCheck(pressings, [], [want(5, 100)]).wanted).toBe(true)
    expect(shopCheck(pressings, [], [want(5, 200)]).wanted).toBe(false)
  })

  it('ignores a missing master', () => {
    expect(shopCheck([{ id: 1 }], [copy(9, 3, 0)], [want(5, 0)])).toEqual({ owned: undefined, otherPressing: undefined, wanted: false })
  })
})

describe('shop list', () => {
  beforeEach(clearShopList)

  it('puts a rescan back on top instead of listing it twice', () => {
    addToShopList('111', 1)
    addToShopList('222', 2)
    expect(addToShopList('111', 3).map((s) => s.barcode)).toEqual(['111', '222'])
    expect(shopList()).toHaveLength(2)
  })
})
