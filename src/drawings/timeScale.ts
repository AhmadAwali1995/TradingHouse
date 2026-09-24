import type { IChartApiBase, ISeriesApi, Logical, SeriesType, Time } from 'lightweight-charts'

function barTimes(series: ISeriesApi<SeriesType, Time>): number[] {
  const times: number[] = []
  for (const item of series.data()) {
    if (typeof item.time === 'number') {
      times.push(item.time)
    }
  }
  return times
}

function barPeriod(times: number[]): number {
  const last = times[times.length - 1]
  const previous = times[times.length - 2]
  if (last !== undefined && previous !== undefined && last > previous) {
    return last - previous
  }
  return 3600
}

export function timeToX(
  chart: IChartApiBase<Time>,
  series: ISeriesApi<SeriesType, Time>,
  time: number,
): number | null {
  const direct = chart.timeScale().timeToCoordinate(time as Time)
  if (direct !== null) {
    return direct
  }
  const times = barTimes(series)
  const last = times[times.length - 1]
  if (last === undefined) {
    return null
  }
  const logical = times.length - 1 + (time - last) / barPeriod(times)
  return chart.timeScale().logicalToCoordinate(logical as Logical)
}

export function coordinateToUnix(
  chart: IChartApiBase<Time>,
  series: ISeriesApi<SeriesType, Time>,
  x: number,
): number | null {
  const direct = chart.timeScale().coordinateToTime(x)
  if (typeof direct === 'number') {
    return direct
  }
  const logical = chart.timeScale().coordinateToLogical(x)
  if (logical === null) {
    return null
  }
  const times = barTimes(series)
  const last = times[times.length - 1]
  if (last === undefined) {
    return null
  }
  return last + (logical - (times.length - 1)) * barPeriod(times)
}
