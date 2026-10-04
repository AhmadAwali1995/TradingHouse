import { API_BASE_URL } from '../apiBase'
import type { Candle } from '../candles'
import { getToken } from '../auth/session'
import { DEFAULT_ACCOUNT_SIZE, DEFAULT_RISK_PERCENT } from '../drawings/position'
import { DEFAULT_LINE_STYLE, DEFAULT_LINE_WIDTH, type PositionDrawing } from '../drawings/types'

export type TestOrder = {
  openTime: number
  closeTime: number
  side: 'long' | 'short'
  entryPrice: number
  stopPrice: number
  targetPrice: number
}

export async function fetchTestOrders(symbol: string): Promise<TestOrder[]> {
  const token = getToken()
  if (!token) {
    return []
  }
  const response = await fetch(
    `${API_BASE_URL}/api/strategies/test/orders?symbol=${encodeURIComponent(symbol)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!response.ok) {
    return []
  }
  const body = (await response.json()) as TestOrder[]
  return Array.isArray(body) ? body : []
}

function barSeconds(candles: Candle[]): number {
  for (let index = candles.length - 1; index > 0; index -= 1) {
    const delta = Math.abs(candles[index].time - candles[index - 1].time)
    if (delta > 0) {
      return delta
    }
  }
  return 60
}

export function testOrderDrawings(orders: TestOrder[], candles: Candle[]): PositionDrawing[] {
  const bar = barSeconds(candles)
  return orders.map((order) => {
    let start = order.openTime
    for (const candle of candles) {
      if (candle.time <= order.openTime) {
        start = candle.time
      } else {
        break
      }
    }
    const end = Math.max(order.closeTime, start + bar)
    return {
      id: `strategy-test-${order.openTime}-${order.side}`,
      type: order.side === 'short' ? 'shortPosition' : 'longPosition',
      color: '#d1d4dc',
      lineWidth: DEFAULT_LINE_WIDTH,
      lineStyle: DEFAULT_LINE_STYLE,
      startTime: start,
      endTime: end > start ? end : start + bar,
      entryPrice: order.entryPrice,
      targetPrice: order.targetPrice,
      stopPrice: order.stopPrice,
      accountSize: DEFAULT_ACCOUNT_SIZE,
      riskPercent: DEFAULT_RISK_PERCENT,
    }
  })
}
