import { ScanText } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from './ui'

// Picks or takes a photo and runs on-device OCR on it
export function ReadPhotoButton({ label, rotations, onText }: { label: string; rotations?: number[]; onText: (text: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function read(file: File) {
    setError(null)
    setStatus('Starting')
    try {
      const { readText } = await import('../ocr/ocr')
      onText(await readText(file, rotations, setStatus))
    } catch {
      setError("Couldn't read that photo. Try again, or type it in.")
    } finally {
      setStatus(null)
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" className="w-full" disabled={Boolean(status)} onClick={() => ref.current?.click()}>
        {status ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            {status}…
          </>
        ) : (
          <>
            <ScanText size={20} aria-hidden />
            {label}
          </>
        )}
      </Button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) read(f)
          e.target.value = ''
        }}
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
