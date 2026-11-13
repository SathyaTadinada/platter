import { useEffect, useState } from 'react'

const BELOW_HEADER = 80
const GAP = 16

// A side column that stays in view while the page scrolls, without a scroll bar of its own. One that
// fits sticks just below the header. A taller one scrolls along with the page until its bottom shows,
// then stays put there: its sticky top goes negative by however much it's too tall.
export function useStickyColumn() {
  const [column, setColumn] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const scroller = column?.closest('main')
    if (!column || !scroller) return
    const place = () => {
      column.style.top = `${Math.min(BELOW_HEADER, scroller.clientHeight - column.offsetHeight - GAP)}px`
    }
    place()
    const watch = new ResizeObserver(place)
    watch.observe(column)
    watch.observe(scroller)
    return () => watch.disconnect()
  }, [column])
  return setColumn
}
