// Pulls likely catalog numbers out of OCR text from a record spine, e.g.
// "PINK FLOYD  THE DARK SIDE OF THE MOON  SHVL 804" -> ["SHVL 804"].
// Catalog numbers mix letters and digits, or are a run of digits with dashes.

const PATTERN = /\b(?:[A-Z]{1,6}[ .-]?\d[\dA-Z]{1,7}(?:[ .-]\d{1,4}[A-Z]?)?|\d{1,3}[ .-]?\d{3,6}(?:[ .-]\d{1,4})?|\d[A-Z][ .-]?\d{3,6})\b/g

export function catnoCandidates(text: string): string[] {
  const found: string[] = []
  for (const line of text.toUpperCase().split(/\n+/)) {
    // a barcode printed with spaces ("0 75678 16412 5") isn't a catalog number
    if (/^[\d\s]+$/.test(line.trim()) && /^\d{12,13}$/.test(line.replace(/\s/g, ''))) continue
    for (const m of line.matchAll(PATTERN)) {
      const c = m[0].trim()
      const digits = c.replace(/\D/g, '').length
      // skip years and lone short numbers, and barcodes (searched differently)
      if (digits < 3 || /^(19|20)\d{2}$/.test(c) || /^\d{12,13}$/.test(c.replace(/\D/g, ''))) continue
      found.push(c)
    }
  }
  return [...new Set(found)].slice(0, 6)
}
