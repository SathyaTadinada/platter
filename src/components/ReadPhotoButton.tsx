import { Camera, ImageUp } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from './Toaster'
import { Button } from './ui'

// Phones and tablets offer the camera from a file picker; computers only ever open files
export const canTakePhoto = () => matchMedia('(pointer: coarse)').matches

// Picks or takes a photo and runs on-device OCR on it. Compact is a square icon button to sit
// beside a field, with the label as its name and a failure shown as a toast.
export function ReadPhotoButton({
  label,
  rotations,
  onText,
  compact,
}: {
  label: string
  rotations?: number[]
  onText: (text: string) => void
  compact?: boolean
}) {
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
      const message = "Couldn't read that photo. Try again, or type it in."
      if (compact) toast(message, { tone: 'error' })
      else setError(message)
    } finally {
      setStatus(null)
    }
  }

  const icon = canTakePhoto() ? <Camera size={20} aria-hidden /> : <ImageUp size={20} aria-hidden />
  const spinner = <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
  const picker = (
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
  )

  if (compact) {
    return (
      <>
        <Button
          variant="secondary"
          className="w-12 shrink-0 px-0"
          aria-label={status ? `${status}…` : label}
          title={label}
          disabled={Boolean(status)}
          onClick={() => ref.current?.click()}
        >
          {status ? spinner : icon}
        </Button>
        {picker}
      </>
    )
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" className="w-full" disabled={Boolean(status)} onClick={() => ref.current?.click()}>
        {status ? (
          <>
            {spinner}
            {status}…
          </>
        ) : (
          <>
            {icon}
            {label}
          </>
        )}
      </Button>
      {picker}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
