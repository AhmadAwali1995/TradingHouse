import type { Candle } from '../candles'
import { DEFAULT_ACCOUNT_SIZE } from '../drawings/position'
import type { PositionDrawing } from '../drawings/types'
import { DEFAULT_DC_SETTINGS, calculateDonchian, type DcSettings } from '../indicators/donchian/donchian'
import { calculateMa, type MaRibbonSettings } from '../indicators/maRibbon/maRibbon'
import type { SmaDcRatio } from './smaDc'

export const MA_DC_DYNAMIC_RISK_PERCENT = 0.5
export const MA_DC_DYNAMIC_TRAIL_PERCENT = 0.15

export function buildMaDcDynamicOrders(
  candles: Candle[],
  settings: MaRibbonSettings,
  rewardRatio: SmaDcRatio,
  dcSettings: DcSettings = DEFAULT_DC_SETTINGS,
): PositionDrawing[] {
  const maByTime = new Map(calculateMa(candles, settings.ma1).map((point) => [point.time, point.value]))
  const dcByTime = new Map(calculateDonchian(candles, dcSettings).map((point) => [point.time, point]))
  const orders: PositionDrawing[] = []
  let flatAfter = -1

  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1]
    const candle = candles[index]
    const previousDc = dcByTime.get(previous.time)
    const ma = maByTime.get(candle.time)
    const dc = dcByTime.get(candle.time)
    if (previousDc === undefined || dc === undefined || ma === undefined || candle.time <= flatAfter) {
      continue
    }
    if (!(previous.close <= previousDc.basis && candle.close > dc.basis && candle.close > ma)) {
      continue
    }

    const entry = candle.close
    const stop = entry * (1 - MA_DC_DYNAMIC_RISK_PERCENT / 100)
    const target = entry + (entry - stop) * rewardRatio
    let endTime = candles[candles.length - 1]?.time ?? candle.time
    let signalExit = false
    let signalPrice: number | undefined
    let exitKind: 'trail' | 'basis' | 'target' | undefined
    let touchedUpper = false
    let peak = -Infinity
    let trail: number | null = null
    let trailFrom: number | undefined

    for (let later = index + 1; later < candles.length; later += 1) {
      const bar = candles[later]
      const previousBar = candles[later - 1]
      if (bar.high >= target) {
        endTime = bar.time
        exitKind = 'target'
        break
      }
      if (trail !== null && bar.low <= trail) {
        endTime = bar.time
        signalExit = true
        signalPrice = trail
        exitKind = 'trail'
        break
      }
      const basis = dcByTime.get(bar.time)?.basis
      const previousBasis = dcByTime.get(previousBar.time)?.basis
      if (
        basis !== undefined &&
        previousBasis !== undefined &&
        previousBar.close >= previousBasis &&
        bar.close < basis
      ) {
        endTime = bar.time
        signalExit = true
        signalPrice = bar.close
        exitKind = 'basis'
        break
      }
      const upper = dcByTime.get(bar.time)?.upper
      if (upper !== undefined && bar.high >= upper) {
        touchedUpper = true
      }
      if (!touchedUpper) {
        continue
      }
      peak = Math.max(peak, bar.high)
      const nextTrail = peak * (1 - MA_DC_DYNAMIC_TRAIL_PERCENT / 100)
      if (trail === null || nextTrail > trail) {
        trail = nextTrail
        trailFrom ??= bar.time
      }
    }

    flatAfter = endTime
    orders.push({
      id: `strategy-ma-dc-dynamic-${candle.time}`,
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
      riskPercent: MA_DC_DYNAMIC_RISK_PERCENT,
      signalExit,
      signalPrice,
      exitKind,
      trailPrice: trail ?? undefined,
      trailFrom,
      mark: `MA_DC_dynamic 1:${rewardRatio}`,
    })
  }

  return orders
}
