// One stable colour pair per person, shared by <Avatar> and the globe's DOM pins.
const GRADIENTS = [
  ['#7cc4f5', '#3d8fe0'],
  ['#86d99a', '#3aa865'],
  ['#c9a3ff', '#8b5cf0'],
  ['#ffd46b', '#f2a81d'],
  ['#ff9cc0', '#e8608f'],
  ['#ffa07a', '#f0645a'],
  ['#8fe0d4', '#2fa896'],
] as const

export function gradientFor(id: string): readonly [string, string] {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return GRADIENTS[h % GRADIENTS.length]
}

export function initialOf(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?'
}
