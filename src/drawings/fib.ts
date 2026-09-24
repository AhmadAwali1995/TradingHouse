import type { FibSettings } from './types'

export const DEFAULT_FIB_SETTINGS: FibSettings = {
  reverse: false,
  extendLeft: false,
  extendRight: false,
  showLabels: true,
  fill: true,
  levels: [
    { value: 0, visible: true, color: '#787b86' },
    { value: 0.236, visible: true, color: '#f23645' },
    { value: 0.382, visible: true, color: '#ff9800' },
    { value: 0.5, visible: true, color: '#2962ff' },
    { value: 0.618, visible: true, color: '#089981' },
    { value: 0.786, visible: true, color: '#26c6da' },
    { value: 1, visible: true, color: '#787b86' },
    { value: 1.272, visible: true, color: '#e91e63' },
    { value: 1.414, visible: false, color: '#9c27b0' },
    { value: 1.618, visible: true, color: '#2962ff' },
    { value: 2.618, visible: false, color: '#ff9800' },
    { value: -0.272, visible: false, color: '#868993' },
    { value: -0.618, visible: false, color: '#f23645' },
  ],
}

export function cloneFibSettings(settings: FibSettings = DEFAULT_FIB_SETTINGS): FibSettings {
  return {
    ...settings,
    levels: settings.levels.map((level) => ({ ...level })),
  }
}

export function fibPrice(start: number, end: number, level: number, reverse: boolean): number {
  const high = reverse ? end : start
  const low = reverse ? start : end
  return low + (high - low) * level
}
