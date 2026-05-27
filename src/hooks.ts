import { useMemo } from 'react'
import type { Well } from './types'

export function useWellStats(wells: Well[]) {
  return useMemo(() => {
    const withDepth = wells.filter(w => w.drillDepth != null)
    const withWater = wells.filter(w => w.staticWaterLevel != null)
    const depths = withDepth.map(w => w.drillDepth!)
    const waterLevels = withWater.map(w => w.staticWaterLevel!)

    const avgDepth = depths.length ? depths.reduce((a, b) => a + b, 0) / depths.length : 0
    const medianDepth = depths.length ? sorted(depths)[Math.floor(depths.length / 2)] : 0
    const maxDepth = depths.length ? Math.max(...depths) : 0
    const avgWater = waterLevels.length ? waterLevels.reduce((a, b) => a + b, 0) / waterLevels.length : 0
    const medianWater = waterLevels.length ? sorted(waterLevels)[Math.floor(waterLevels.length / 2)] : 0

    const byDecade: Record<string, number> = {}
    const byUse: Record<string, number> = {}
    const byType: Record<string, number> = {}
    const depthBuckets: Record<string, number> = {
      '0–100': 0, '101–200': 0, '201–300': 0, '301–500': 0, '501–1000': 0, '1000+': 0,
    }
    const drillerCounts: Record<string, number> = {}
    const byBasin: Record<string, number> = {}

    for (const w of wells) {
      if (w.completionDate) {
        const year = parseInt(w.completionDate.split('/')[2])
        if (!isNaN(year)) {
          const decade = `${Math.floor(year / 10) * 10}s`
          byDecade[decade] = (byDecade[decade] || 0) + 1
        }
      }
      if (w.proposedUse) byUse[w.proposedUse] = (byUse[w.proposedUse] || 0) + 1
      if (w.workType) byType[w.workType] = (byType[w.workType] || 0) + 1
      if (w.drillerName) drillerCounts[w.drillerName] = (drillerCounts[w.drillerName] || 0) + 1
      if (w.basinName) byBasin[w.basinName] = (byBasin[w.basinName] || 0) + 1

      if (w.drillDepth != null) {
        const d = w.drillDepth
        if (d <= 100) depthBuckets['0–100']++
        else if (d <= 200) depthBuckets['101–200']++
        else if (d <= 300) depthBuckets['201–300']++
        else if (d <= 500) depthBuckets['301–500']++
        else if (d <= 1000) depthBuckets['501–1000']++
        else depthBuckets['1000+']++
      }
    }

    const topDrillers = Object.entries(drillerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)

    const oldestYear = wells.reduce((min, w) => {
      const y = parseInt(w.completionDate?.split('/')[2])
      return !isNaN(y) && y < min ? y : min
    }, 9999)

    const newestYear = wells.reduce((max, w) => {
      const y = parseInt(w.completionDate?.split('/')[2])
      return !isNaN(y) && y > max ? y : max
    }, 0)

    return {
      total: wells.length,
      avgDepth: Math.round(avgDepth),
      medianDepth: Math.round(medianDepth),
      maxDepth,
      avgWater: Math.round(avgWater),
      medianWater: Math.round(medianWater),
      byDecade,
      byUse,
      byType,
      depthBuckets,
      topDrillers,
      byBasin,
      oldestYear,
      newestYear,
    }
  }, [wells])
}

function sorted(arr: number[]) {
  return [...arr].sort((a, b) => a - b)
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
