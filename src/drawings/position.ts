import type { Candle } from '../candles'
import type { ChartPoint, PositionDrawing } from './types'

export const DEFAULT_ACCOUNT_SIZE = 1000
export const DEFAULT_RISK_PERCENT = 1
export const MAX_RISK_PERCENT = 1.2

export function longRiskPercent(entry: number, stop: number): number | null {
  if (!(entry > stop) || !(entry > 0)) {
    return null
  }
  return ((entry - stop) / entry) * 100
}

export function acceptsLongRisk(entry: number, stop: number): boolean {
  const risk = longRiskPercent(entry, stop)
  return risk !== null && risk <= MAX_RISK_PERCENT
}

export function accountMove(amount: number, entry: number, exit: number): number {
  if (!(entry > 0)) {
    return 0
  }
  return amount * ((exit - entry) / entry)
}

export type PositionLevels = {
  startTime: number
  endTime: number
  entryPrice: number
  targetPrice: number
  stopPrice: number
}

function barSeconds(candles: Candle[]): number {
  for (let index = candles.length - 1; index > 0; index -= 1) {
    const delta = Math.abs(candles[index].time - candles[index - 1].time)
    if (delta > 0) {
      return delta
    }
  }
  return 24 * 60 * 60
}

function stopDistance(candles: Candle[], price: number): number {
  const ranges = candles
    .slice(-40)
    .map((candle) => candle.high - candle.low)
    .filter((range) => range > 0)
    .sort((a, b) => a - b)
  const median = ranges.length > 0 ? ranges[Math.floor(ranges.length / 2)] : price * 0.004
  return Math.max(median * 5, Math.abs(price) * 0.0015)
}

export function positionLevels(side: 'long' | 'short', entry: ChartPoint, candles: Candle[]): PositionLevels {
  const half = barSeconds(candles) * 12
  const risk = stopDistance(candles, entry.price)
  const reward = risk * 2
  return {
    startTime: entry.time - half,
    endTime: entry.time + half,
    entryPrice: entry.price,
    targetPrice: side === 'long' ? entry.price + reward : entry.price - reward,
    stopPrice: side === 'long' ? entry.price - risk : entry.price + risk,
  }
}

function formatPrice(value: number): string {
  const abs = Math.abs(value)
  const digits = abs >= 100 ? 2 : abs >= 1 ? 4 : 6
  return value.toLocaleString('en-US', {
    minimumFractionDigits: Math.min(2, digits),
    maximumFractionDigits: digits,
  })
}

function formatSignedMoney(value: number): string {
  const body = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return value > 0 ? `+${body}` : value < 0 ? `−${body}` : body
}

function formatPercent(value: number): string {
  const body = `${Math.abs(value).toFixed(2)}%`
  return value > 0 ? `+${body}` : value < 0 ? `−${body}` : body
}

export type PositionBar = {
  time: number
  open: number
  high: number
  low: number
  close?: number
}

export type PositionTrigger = 'target' | 'stop' | null

function barHit(
  drawing: Pick<PositionDrawing, 'type' | 'targetPrice' | 'stopPrice'>,
  bar: PositionBar,
): PositionTrigger {
  const long = drawing.type === 'longPosition'
  const hitTarget = long ? bar.high >= drawing.targetPrice : bar.low <= drawing.targetPrice
  const hitStop = long ? bar.low <= drawing.stopPrice : bar.high >= drawing.stopPrice
  if (hitTarget && hitStop) {
    return Math.abs(bar.open - drawing.stopPrice) <= Math.abs(bar.open - drawing.targetPrice) ? 'stop' : 'target'
  }
  if (hitTarget) {
    return 'target'
  }
  if (hitStop) {
    return 'stop'
  }
  return null
}

function riskStart(drawing: { startTime: number; activeFrom?: number }) {
  return drawing.activeFrom ?? drawing.startTime
}

export function positionExitTime(
  drawing: Pick<PositionDrawing, 'type' | 'startTime' | 'targetPrice' | 'stopPrice' | 'activeFrom'>,
  bars: PositionBar[],
): number | null {
  for (const bar of bars) {
    if (bar.time <= riskStart(drawing)) {
      continue
    }
    if (barHit(drawing, bar)) {
      return bar.time
    }
  }
  return null
}

export function positionTrigger(drawing: PositionDrawing, bars: PositionBar[]): PositionTrigger {
  for (const bar of bars) {
    if (bar.time <= riskStart(drawing)) {
      continue
    }
    const hit = barHit(drawing, bar)
    if (hit) {
      return hit
    }
  }
  return null
}

function realizedExit(
  drawing: PositionDrawing,
  bars: PositionBar[],
  trigger: PositionTrigger,
): { price: number; kind: 'target' | 'stop' | 'signal' } | null {
  const naturalExit = positionExitTime(drawing, bars)
  if (drawing.id.startsWith('strategy-') && naturalExit !== null && drawing.endTime < naturalExit) {
    const bar = bars.find((item) => item.time === drawing.endTime)
    if (bar?.close !== undefined) {
      return { price: bar.close, kind: 'signal' }
    }
  }
  if (trigger === 'target') {
    return { price: drawing.targetPrice, kind: 'target' }
  }
  if (trigger === 'stop') {
    return { price: drawing.stopPrice, kind: 'stop' }
  }
  return null
}

export function positionStats(drawing: PositionDrawing, bars: PositionBar[]) {
  const targetPct = drawing.entryPrice === 0 ? 0 : ((drawing.targetPrice - drawing.entryPrice) / drawing.entryPrice) * 100
  const stopPct = drawing.entryPrice === 0 ? 0 : ((drawing.stopPrice - drawing.entryPrice) / drawing.entryPrice) * 100
  const trigger = positionTrigger(drawing, bars)
  const exit = realizedExit(drawing, bars, trigger)
  const long = drawing.type === 'longPosition'
  const profit =
    exit === null
      ? null
      : accountMove(
          drawing.accountSize,
          drawing.entryPrice,
          long ? exit.price : drawing.entryPrice - (exit.price - drawing.entryPrice),
        )
  const result = profit === null ? '' : `  P&L: ${formatSignedMoney(profit)}`
  const showOnTarget = profit !== null && profit >= 0
  const showOnStop = profit !== null && profit < 0

  return {
    trigger,
    targetLabel: `${exit?.kind === 'target' ? 'Take profit' : 'Target'}: ${formatPrice(drawing.targetPrice)} (${formatPercent(targetPct)})${showOnTarget ? result : ''}`,
    stopLabel: `${exit?.kind === 'stop' ? 'Stop loss' : 'Stop'}: ${formatPrice(drawing.stopPrice)} (${formatPercent(stopPct)})${showOnStop ? result : ''}`,
  }
}
