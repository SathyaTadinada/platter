export const digitsOnly = (s: string) => s.replace(/\D/g, '')

// GTIN mod-10 check (EAN-8, UPC-A, EAN-13)
export function hasValidCheckDigit(code: string): boolean {
  if (!/^\d{8}$|^\d{12,13}$/.test(code)) return false
  const digits = [...code].map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

// UPC-E (8 digits incl. number system and check) to UPC-A
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null
  const ns = code[0]
  const m = code.slice(1, 7)
  const check = code[7]
  const last = Number(m[5])
  let body: string
  if (last <= 2) body = m[0] + m[1] + m[5] + '0000' + m[2] + m[3] + m[4]
  else if (last === 3) body = m[0] + m[1] + m[2] + '00000' + m[3] + m[4]
  else if (last === 4) body = m[0] + m[1] + m[2] + m[3] + '00000' + m[4]
  else body = m.slice(0, 5) + '0000' + m[5]
  const upca = ns + body + check
  return hasValidCheckDigit(upca) ? upca : null
}

// Forms of the same code worth trying, most likely first.
// Discogs stores barcodes however the submitter typed them.
export function barcodeVariants(raw: string): string[] {
  const code = digitsOnly(raw)
  const out = [code]
  if (code.length === 12) out.push('0' + code)
  if (code.length === 13 && code.startsWith('0')) out.push(code.slice(1))
  if (code.length === 8) {
    const upca = expandUpcE(code)
    if (upca) out.push(upca, '0' + upca)
  }
  return [...new Set(out)].filter(Boolean)
}

// Groups digits the way they're printed under the bars, as the user types:
// UPC-A "0 75678 16412 5", EAN-13 "5 012394 144777".
export function formatBarcodeInput(raw: string): string {
  const d = digitsOnly(raw).slice(0, 13)
  const groups = d.length === 13 ? [1, 6, 6] : [1, 5, 5, 1]
  const out: string[] = []
  let i = 0
  for (const g of groups) {
    if (i >= d.length) break
    out.push(d.slice(i, i + g))
    i += g
  }
  return out.join(' ')
}
