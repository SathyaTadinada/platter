// Badges an admin can give. Add one here and it shows in the Members table and is accepted by the server.
export const BADGES = [{ id: 'early', label: 'Early supporter' }] as const

export type Badge = (typeof BADGES)[number]['id']

export const isBadge = (x: unknown): x is Badge => BADGES.some((b) => b.id === x)
