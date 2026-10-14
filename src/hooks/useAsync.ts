import { useCallback, useEffect, useState, type DependencyList } from 'react'

export type AsyncState<T> = { loading: boolean; error: Error | null; data: T | undefined }

// Runs fn when deps change; ignores results from stale runs.
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({ loading: true, error: null, data: undefined })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn().then(
      (data) => live && setState({ loading: false, error: null, data }),
      (error: Error) => live && setState({ loading: false, error, data: undefined }),
    )
    return () => {
      live = false
    }
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { ...state, reload }
}
