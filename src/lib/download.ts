import { localDate } from './value'

// Hand a generated file to the browser to save
export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

// for file names, in local time (toISOString would give tomorrow's date on a US evening)
export const today = () => localDate(Date.now())
