export const INDICATOR_ITEMS = [
  { id: 'sma', label: 'SMA' },
  { id: 'la_nwe', label: 'LuxAlgo Nadaraya-Watson Envelope' },
  { id: 'rsi', label: 'Better RSI' },
  { id: 'cipherB', label: 'Cipher_B_free' },
  { id: 'macd', label: 'MACD' },
  { id: 'cmMacd', label: 'CM_Ult_MacD_MTF' },
] as const

export type IndicatorId = (typeof INDICATOR_ITEMS)[number]['id']

export type IndicatorVisibility = Record<IndicatorId, boolean>
