import type { Candle } from '../candles'
import { calculateMa, type MaRibbonSettings } from '../indicators/maRibbon/maRibbon'
import { DEFAULT_ACCOUNT_SIZE } from '../drawings/position'
import type { PositionDrawing } from '../drawings/types'

export type SmaDcRatio = 2 | 3

export const SMA_DC_RISK_PERCENT = 0.5

export function buildSmaDcOrders(
  candles: Candle[],
  settings: MaRibbonSettings,
  rewardRatio: SmaDcRatio,
): PositionDrawing[] {
  const smaByTime = new Map(calculateMa(candles, settings.ma1).map((point) => [point.time, point.value]))
  const orders: PositionDrawing[] = []
  let flatAfter = -1

  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1]
    const candle = candles[index]
    const previousSma = smaByTime.get(previous.time)
    const sma = smaByTime.get(candle.time)
    if (previousSma === undefined || sma === undefined || candle.time <= flatAfter) {
      continue
    }
    if (!(previous.close <= previousSma && candle.close > sma)) {
      continue
    }

    const entry = candle.close
    const stop = entry * (1 - SMA_DC_RISK_PERCENT / 100)
    const target = entry + (entry - stop) * rewardRatio
    let endTime = candles[candles.length - 1]?.time ?? candle.time

    for (let later = index + 1; later < candles.length; later += 1) {
      const bar = candles[later]
      if (bar.low <= stop || bar.high >= target) {
        endTime = bar.time
        break
      }
    }

    flatAfter = endTime
    orders.push({
      id: `strategy-sma-dc-${candle.time}`,
      type: 'longPosition',
      color: '#d1d4dc',
      lineWidth: 1,
      lineStyle: 'solid',
      startTime: candle.time,
      endTime,
      activeFrom: candle.time,
      entryPrice: entry,
      targetPrice: target,
      stopPrice: stop,
      accountSize: DEFAULT_ACCOUNT_SIZE,
      riskPercent: SMA_DC_RISK_PERCENT,
      mark: `SMA_DC 1:${rewardRatio}`,
    })
  }

  return orders
}
