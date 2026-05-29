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
      '< 250': 0, '250–500': 0, '500+': 0,
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
        if (d < 250) depthBuckets['< 250']++
        else if (d <= 500) depthBuckets['250–500']++
        else depthBuckets['500+']++
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

    // Data quality stats
    let parcelMatched = 0
    let userVerified = 0
    let logScanned = 0
    let noApn = 0
    let hasAddress = 0
    for (const w of wells) {
      if (w.gpsSource === 'user_verified') userVerified++
      if (w.dataQuality === 'parcel_matched') parcelMatched++
      if (w.dataQuality === 'log_scanned') logScanned++
      if (w.dataQuality === 'no_apn') noApn++
      if (w.scanAddress) hasAddress++
    }

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
      quality: {
        parcelMatched,
        userVerified,
        logScanned,
        noApn,
        hasAddress,
      },
    }
  }, [wells])
}

function sorted(arr: number[]) {
  return [...arr].sort((a, b) => a - b)
}

export function normalizeApnForParcel(wellApn: string): string | null {
  if (!wellApn || !wellApn.includes('-')) return null
  const parts = wellApn.split('-')
  if (parts.length !== 3) return null
  const book = parseInt(parts[0])
  if (isNaN(book)) return null
  const bookDigit = String(book).slice(-1)
  return `${bookDigit}${parts[1]}${parts[2]}`
}

const PARCEL_QUERY_URL = 'https://arcgis.water.nv.gov/arcgis/rest/services/BaseLayers/County_Parcels_in_Nevada/MapServer/0/query'

export async function lookupParcelByApn(apn: string): Promise<{ center: [number, number]; acres: number; parcelApn: string } | null> {
  const normalized = apn.replace(/-/g, '').replace(/\s/g, '')
  const tryApns = [normalized]
  if (apn.includes('-')) {
    const pa = normalizeApnForParcel(apn)
    if (pa) tryApns.unshift(pa)
  }

  for (const tryApn of tryApns) {
    const url = `${PARCEL_QUERY_URL}?where=APN%3D%27${tryApn}%27+AND+County%3D%27Storey%27&outFields=APN,Acres&returnGeometry=true&outSR=4326&f=geojson`
    const resp = await fetch(url)
    const data = await resp.json()
    if (data.features?.length > 0) {
      const f = data.features[0]
      const geom = f.geometry
      const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0]
      const lats = coords.map((c: number[]) => c[1])
      const lngs = coords.map((c: number[]) => c[0])
      return {
        center: [lats.reduce((a: number, b: number) => a + b, 0) / lats.length, lngs.reduce((a: number, b: number) => a + b, 0) / lngs.length],
        acres: f.properties.Acres,
        parcelApn: f.properties.APN,
      }
    }
  }
  return null
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
