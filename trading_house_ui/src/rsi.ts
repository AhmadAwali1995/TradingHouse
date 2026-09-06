import type { BitcoinCandle } from './bitcoinCandles'

export const RSI_LENGTH = 14

export type RsiPoint = {
  time: number
  value: number
}

function rma(values: number[], length: number): Array<number | null> {
  const result: Array<number | null> = []
  let previous: number | null = null
  let sum = 0

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]

    if (index < length) {
      sum += value
      if (index === length - 1) {
        previous = sum / length
        result.push(previous)
      } else {
        result.push(null)
      }
      continue
    }

    previous = ((previous as number) * (length - 1) + value) / length
    result.push(previous)
  }

  return result
}

export function calculateTradingViewRsi(
  candles: BitcoinCandle[],
  length = RSI_LENGTH,
): RsiPoint[] {
  if (candles.length < length + 1) {
    return []
  }

  const gains: number[] = []
  const losses: number[] = []

  for (let index = 1; index < candles.length; index += 1) {
    const change = candles[index].close - candles[index - 1].close
    gains.push(Math.max(change, 0))
    losses.push(Math.max(-change, 0))
  }

  const avgGains = rma(gains, length)
  const avgLosses = rma(losses, length)
  const points: RsiPoint[] = []

  for (let index = 0; index < avgGains.length; index += 1) {
    const avgGain = avgGains[index]
    const avgLoss = avgLosses[index]
    if (avgGain === null || avgLoss === null) {
      continue
    }

    let rsi: number
    if (avgLoss === 0) {
      rsi = 100
    } else if (avgGain === 0) {
      rsi = 0
    } else {
      rsi = 100 - 100 / (1 + avgGain / avgLoss)
    }

    points.push({
      time: candles[index + 1].time,
      value: rsi,
    })
  }

  return points
}
