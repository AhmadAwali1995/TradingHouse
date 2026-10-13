import type { Candle } from '../candles'
import { DEFAULT_ACCOUNT_SIZE } from '../drawings/position'
import type { PositionDrawing } from '../drawings/types'
import { DEFAULT_DC_SETTINGS, calculateDonchian, type DcSettings } from '../indicators/donchian/donchian'
import { calculateMa, type MaRibbonSettings } from '../indicators/maRibbon/maRibbon'

export type SmaDcRatio = 2 | 3

export const SMA_DC_RISK_PERCENT = 0.5

export function buildSmaDcOrders(
  candles: Candle[],
  settings: MaRibbonSettings,
  rewardRatio: SmaDcRatio,
  requireAboveSlowMa: boolean,
  dcSettings: DcSettings = DEFAULT_DC_SETTINGS,
): PositionDrawing[] {
  const smaByTime = new Map(calculateMa(candles, settings.ma1).map((point) => [point.time, point.value]))
  const basisByTime = new Map(calculateDonchian(candles, dcSettings).map((point) => [point.time, point.basis]))
  const slowByTime = requireAboveSlowMa
    ? new Map(calculateMa(candles, settings.ma2).map((point) => [point.time, point.value]))
    : null
  const orders: PositionDrawing[] = []
  let flatAfter = -1
  const idPrefix = requireAboveSlowMa ? 'strategy-sma-dc' : 'strategy-ma-dc'
  const label = requireAboveSlowMa ? 'SMA_DC' : 'MA_DC'

  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1]
    const candle = candles[index]
    const previousBasis = basisByTime.get(previous.time)
    const basis = basisByTime.get(candle.time)
    const ma = smaByTime.get(candle.time)
    const slow = slowByTime?.get(candle.time)
    if (previousBasis === undefined || basis === undefined || ma === undefined || candle.time <= flatAfter) {
      continue
    }
    if (requireAboveSlowMa && slow === undefined) {
      continue
    }
    const crossedMiddle = previous.close <= previousBasis && candle.close > basis
    const aboveMa = candle.close > ma
    const aboveSlow = !requireAboveSlowMa || (slow !== undefined && candle.low > slow)
    if (!crossedMiddle || !aboveMa || !aboveSlow) {
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
      id: `${idPrefix}-${candle.time}`,
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
      mark: `${label} 1:${rewardRatio}`,
    })
  }

  return orders
}
