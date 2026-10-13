export const INDICATOR_ITEMS = [
  { id: 'maRibbon', label: 'MA ribbon' },
  { id: 'dc', label: 'DC' },
] as const

export type IndicatorId = (typeof INDICATOR_ITEMS)[number]['id']

export type IndicatorVisibility = Record<IndicatorId, boolean>
