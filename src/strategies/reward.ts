import type { RewardRatio } from './types'

export function longTargetLevels(
  entry: number,
  stop: number,
  rewardRatio: RewardRatio,
): { multiple: number; portion: number; targetPrice: number }[] {
  const risk = entry - stop
  if (rewardRatio === 2.5) {
    return [
      { multiple: 2, portion: 0.5, targetPrice: entry + risk * 2 },
      { multiple: 3, portion: 0.5, targetPrice: entry + risk * 3 },
    ]
  }
  return [{ multiple: rewardRatio, portion: 1, targetPrice: entry + risk * rewardRatio }]
}
