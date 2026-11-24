import { useSyncExternalStore } from 'react'
import { prefListeners, readChoice, writePref } from '../lib/prefs'
import type { PriceBasis } from '../lib/value'

const PRICE_BASIS = 'platter.prices'

const getPriceBasis = () => readChoice<PriceBasis>(PRICE_BASIS, ['lowest', 'suggested'], 'lowest')
export const setPriceBasis = (b: PriceBasis) => writePref(PRICE_BASIS, b)

const subscribe = (fn: () => void) => {
  const l = (key: string) => key === PRICE_BASIS && fn()
  prefListeners.add(l)
  return () => {
    prefListeners.delete(l)
  }
}

// Settings › Prices (see valueOf)
export const usePriceBasis = () => useSyncExternalStore(subscribe, getPriceBasis)
