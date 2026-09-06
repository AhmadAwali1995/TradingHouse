import apiLinksJson from './api-links.json' with { type: 'json' }
import pairsJson from './pairs.json' with { type: 'json' }

export type ApiLinkId = keyof typeof apiLinksJson

export type Pair = {
  id: string
  name: string
  symbol: string
  baseAsset: string
  quoteAsset: string
  api: ApiLinkId
}

export const API_LINKS = apiLinksJson
export const PAIRS = pairsJson as Pair[]

const firstPair = PAIRS[0]
if (!firstPair) {
  throw new Error('pairs.json must contain at least one pair')
}

export const DEFAULT_PAIR = firstPair

export function getPair(id: string): Pair {
  const pair = PAIRS.find((item) => item.id === id)
  if (!pair) {
    throw new Error(`Unknown pair: ${id}`)
  }
  return pair
}

export function getApiLink(id: ApiLinkId): string {
  return API_LINKS[id]
}
