import { Component, type ReactNode } from 'react'

// If a page throws while rendering, show something better than a blank screen
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-semibold">Something broke on this page</p>
        <p className="max-w-sm text-sm text-stone-500">{error.message}</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => location.reload()}
            className="min-h-11 rounded-xl bg-stone-900 px-4 font-semibold text-white dark:bg-accent dark:text-accent-fg"
          >
            Reload
          </button>
          <a href="/" className="inline-flex min-h-11 items-center rounded-xl bg-stone-200 px-4 font-semibold dark:bg-stone-800">
            Go to your collection
          </a>
        </div>
      </div>
    )
  }
}
