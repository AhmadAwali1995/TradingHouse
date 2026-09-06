export const TIMEFRAMES = [
  { id: '15m', label: '15m' },
  { id: '30m', label: '30m' },
  { id: '45m', label: '45m' },
  { id: '1h', label: '1h' },
  { id: '4h', label: '4h' },
  { id: '1d', label: '1D' },
  { id: '1w', label: '1W' },
] as const

export type TimeframeId = (typeof TIMEFRAMES)[number]['id']

export type BitcoinCandle = {
  time: number
  open: number
  high: number
  low: number
  close: number
}

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  ...unknown[],
]

const BINANCE_INTERVAL: Record<TimeframeId, string> = {
  '15m': '15m',
  '30m': '30m',
  '45m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
}

const TARGET_BARS: Record<TimeframeId, number> = {
  '15m': 4000,
  '30m': 4000,
  '45m': 4000,
  '1h': 4000,
  '4h': 3000,
  '1d': 1500,
  '1w': 400,
}

const PAGE_SIZE = 1000

function aggregateCandles(
  candles: BitcoinCandle[],
  periodSeconds: number,
): BitcoinCandle[] {
  const buckets = new Map<number, BitcoinCandle>()

  for (const candle of candles) {
    const time = Math.floor(candle.time / periodSeconds) * periodSeconds
    const bucket = buckets.get(time)

    if (!bucket) {
      buckets.set(time, {
        time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })
      continue
    }

    bucket.high = Math.max(bucket.high, candle.high)
    bucket.low = Math.min(bucket.low, candle.low)
    bucket.close = candle.close
  }

  return [...buckets.values()]
}

function parseKlines(klines: BinanceKline[]): BitcoinCandle[] {
  return klines.map((kline) => ({
    time: Math.floor(kline[0] / 1000),
    open: Number(kline[1]),
    high: Number(kline[2]),
    low: Number(kline[3]),
    close: Number(kline[4]),
  }))
}

async function fetchKlinePages(
  interval: string,
  targetCount: number,
  signal?: AbortSignal,
): Promise<BitcoinCandle[]> {
  const candles: BitcoinCandle[] = []
  let endTime: number | undefined

  while (candles.length < targetCount) {
    const params = new URLSearchParams({
      symbol: 'BTCUSDT',
      interval,
      limit: String(PAGE_SIZE),
    })

    if (endTime !== undefined) {
      params.set('endTime', String(endTime))
    }

    const response = await fetch(
      `https://api.binance.com/api/v3/klines?${params.toString()}`,
      { signal },
    )

    if (!response.ok) {
      throw new Error(`Failed to load Bitcoin candles (${response.status})`)
    }

    const page = parseKlines((await response.json()) as BinanceKline[])
    if (page.length === 0) {
      break
    }

    candles.unshift(...page)

    if (page.length < PAGE_SIZE) {
      break
    }

    endTime = page[0].time * 1000 - 1
  }

  const unique = new Map<number, BitcoinCandle>()
  for (const candle of candles) {
    unique.set(candle.time, candle)
  }

  return [...unique.values()]
    .sort((left, right) => left.time - right.time)
    .slice(-targetCount)
}

export async function fetchBitcoinCandles(
  timeframe: TimeframeId,
  signal?: AbortSignal,
): Promise<BitcoinCandle[]> {
  const interval = BINANCE_INTERVAL[timeframe]
  const target =
    timeframe === '45m' ? TARGET_BARS[timeframe] * 3 : TARGET_BARS[timeframe]
  const candles = await fetchKlinePages(interval, target, signal)

  if (timeframe === '45m') {
    return aggregateCandles(candles, 45 * 60).slice(-TARGET_BARS[timeframe])
  }

  return candles
}
