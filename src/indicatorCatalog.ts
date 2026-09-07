export const INDICATOR_ITEMS = [
  { id: 'nwe', label: 'LuxAlgo Nadaraya-Watson Envelope' },
  { id: 'rsi', label: 'Better RSI' },
  { id: 'cipherB', label: 'Cipher_B_free' },
] as const

export type IndicatorId = (typeof INDICATOR_ITEMS)[number]['id']

export type IndicatorVisibility = Record<IndicatorId, boolean>
