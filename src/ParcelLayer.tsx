import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Well } from './types'

const PARCEL_URL = 'https://arcgis.water.nv.gov/arcgis/rest/services/BaseLayers/County_Parcels_in_Nevada/MapServer/0/query'
const MIN_ZOOM = 14

const DEPTH_COLORS = {
  shallow: '#22c55e',
  medium: '#f97316',
  deep: '#ef4444',
}

function depthColor(depth: number | null): string {
  if (depth == null) return '#6366f1'
  if (depth < 250) return DEPTH_COLORS.shallow
  if (depth <= 500) return DEPTH_COLORS.medium
  return DEPTH_COLORS.deep
}

function wellApnToParcelApn(wellApn: string): string | null {
  if (!wellApn || !wellApn.includes('-')) return null
  const parts = wellApn.split('-')
  if (parts.length !== 3) return null
  const book = parseInt(parts[0])
  if (isNaN(book)) return null
  return `${book}${parts[1]}${parts[2]}`
}

interface ParcelLayerProps {
  wells: Well[]
  onMatchedWells: (ids: Set<string>) => void
  searchParcelApn?: string | null
  searchPoint?: [number, number] | null
}

function pointInPolygon(lat: number, lng: number, coords: number[][]): boolean {
  let inside = false
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][1], yi = coords[i][0]
    const xj = coords[j][1], yj = coords[j][0]
    if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

function isPointInFeature(lat: number, lng: number, geom: GeoJSON.Geometry): boolean {
  if (geom.type === 'Polygon') return pointInPolygon(lat, lng, geom.coordinates[0])
  if (geom.type === 'MultiPolygon') return geom.coordinates.some(poly => pointInPolygon(lat, lng, poly[0]))
  return false
}

export default function ParcelLayer({ wells, onMatchedWells, searchParcelApn, searchPoint }: ParcelLayerProps) {
  const map = useMap()
  const layerRef = useRef<L.LayerGroup | null>(null)
  const legendRef = useRef<L.Control | null>(null)
  const [loaded, setLoaded] = useState(false)
  const fetchingRef = useRef(false)
  const dataRef = useRef<{ features: GeoJSON.Feature[]; parcelWells: Map<number, Well[]>; matchedIds: Set<string> } | null>(null)

  useEffect(() => {
    function updateVisibility() {
      if (!layerRef.current || !legendRef.current) return
      if (map.getZoom() >= MIN_ZOOM) {
        layerRef.current.addTo(map)
        legendRef.current.addTo(map)
      } else {
        layerRef.current.remove()
        legendRef.current.remove()
      }
    }

    async function loadParcels() {
      if (loaded || fetchingRef.current) return
      fetchingRef.current = true
      try {
        const bounds = '-119.75,39.25,-119.45,39.45'
        const url = `${PARCEL_URL}?where=County%3D%27Storey%27&geometry=${encodeURIComponent(bounds)}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=APN,Acres&returnGeometry=true&outSR=4326&f=geojson`
        const resp = await fetch(url)
        const data = await resp.json()
        if (!data.features) return

        const wellsByParcelApn = new Map<string, Well[]>()
        for (const well of wells) {
          const pa = wellApnToParcelApn(well.apn)
          if (pa) {
            if (!wellsByParcelApn.has(pa)) wellsByParcelApn.set(pa, [])
            wellsByParcelApn.get(pa)!.push(well)
          }
        }

        const matchedIds = new Set<string>()
        const parcelWells = new Map<number, Well[]>()

        for (let fi = 0; fi < data.features.length; fi++) {
          const feature = data.features[fi]
          const parcelApn = (feature.properties?.APN || '').trim()
          const matched = wellsByParcelApn.get(parcelApn)
          if (matched) {
            parcelWells.set(fi, matched)
            for (const w of matched) matchedIds.add(w.id)
          }
        }

        onMatchedWells(matchedIds)
        dataRef.current = { features: data.features, parcelWells, matchedIds }
        setLoaded(true)
        buildLayer()
        updateVisibility()
      } catch {
        // Silently fail
      }
    }

    function buildLayer() {
      if (!dataRef.current) return

      if (layerRef.current) {
        layerRef.current.remove()
      }

      const { features, parcelWells } = dataRef.current
      const group = L.layerGroup()

      // Find search-target parcel index (by APN or by point-in-polygon)
      let searchTargetIndex = -1
      if (searchParcelApn) {
        for (let fi = 0; fi < features.length; fi++) {
          if ((features[fi].properties?.APN || '').trim() === searchParcelApn) {
            searchTargetIndex = fi
            break
          }
        }
      } else if (searchPoint) {
        for (let fi = 0; fi < features.length; fi++) {
          if (features[fi].geometry && isPointInFeature(searchPoint[0], searchPoint[1], features[fi].geometry!)) {
            searchTargetIndex = fi
            break
          }
        }
      }

      let targetLayer: L.GeoJSON | null = null

      for (let fi = 0; fi < features.length; fi++) {
        const feature = features[fi]
        const matched = parcelWells.get(fi)
        const isSearchTarget = fi === searchTargetIndex

        // Parcel polygon — colored by deepest well depth if matched
        const parcelStyle = (() => {
          if (isSearchTarget) {
            const color = matched?.length ? depthColor(matched.reduce((m, w) => Math.max(m, w.drillDepth ?? 0), 0)) : '#2563eb'
            return { color: '#1d4ed8', weight: 5, opacity: 1, fillOpacity: 0.35, fillColor: color, dashArray: undefined as string | undefined }
          }
          if (matched && matched.length > 0) {
            const deepest = matched.reduce((max, w) => (w.drillDepth ?? 0) > (max.drillDepth ?? 0) ? w : max, matched[0])
            const color = depthColor(deepest.drillDepth)
            return { color, weight: 2, opacity: 0.8, fillOpacity: 0.2, fillColor: color, dashArray: undefined as string | undefined }
          }
          return { color: '#9ca3af', weight: 0.5, opacity: 0.3, fillOpacity: 0, fillColor: 'transparent', dashArray: undefined as string | undefined }
        })()

        const geoJsonLayer = L.geoJSON(feature as GeoJSON.Feature, { style: parcelStyle })

        // Popup for parcel
        const address = matched?.find(w => w.scanAddress)?.scanAddress
        let html = `<div class="well-popup"><h3>${isSearchTarget ? 'Selected Parcel' : 'Parcel'}</h3>`
        if (address) {
          html += `<p style="font-size:0.85rem;color:#2563eb;font-weight:600;margin:0 0 0.5rem">${address}</p>`
        }
        html += `<dl class="meta">`
        if (feature.properties?.APN) html += `<dt>APN</dt><dd>${feature.properties.APN}</dd>`
        if (feature.properties?.Acres) html += `<dt>Acres</dt><dd>${feature.properties.Acres.toFixed(2)}</dd>`
        if (matched && matched.length > 0) {
          html += `<dt>Wells</dt><dd>${matched.length}</dd>`
          for (const w of matched) {
            html += `<dt>Log #${w.id}</dt><dd>${w.drillDepth ?? '?'}ft deep${w.staticWaterLevel != null ? `, water at ${w.staticWaterLevel}ft` : ''}</dd>`
          }
        }
        html += `</dl></div>`
        geoJsonLayer.bindPopup(html)
        group.addLayer(geoJsonLayer)

        if (isSearchTarget) {
          targetLayer = geoJsonLayer
        }
      }

      layerRef.current = group

      // Auto-open popup on the search target parcel after a brief delay so the map can fly in first
      if (targetLayer) {
        setTimeout(() => {
          try { targetLayer!.openPopup() } catch {}
        }, 1100)
      }

      // Legend
      if (!legendRef.current) {
        const legend = new L.Control({ position: 'bottomright' })
        legend.onAdd = () => {
          const div = L.DomUtil.create('div', 'parcel-legend')
          div.innerHTML = `
            <strong>Parcel Depth</strong>
            <div><span style="background:${DEPTH_COLORS.shallow}"></span> &lt; 250ft</div>
            <div><span style="background:${DEPTH_COLORS.medium}"></span> 250–500ft</div>
            <div><span style="background:${DEPTH_COLORS.deep}"></span> 500ft+</div>
          `
          return div
        }
        legendRef.current = legend
      }
    }

    if (loaded) {
      buildLayer()
      if (map.getZoom() >= MIN_ZOOM) {
        layerRef.current?.addTo(map)
        legendRef.current?.addTo(map)
      }
    } else {
      loadParcels()
    }

    map.on('zoomend', updateVisibility)
    return () => {
      map.off('zoomend', updateVisibility)
      if (layerRef.current) layerRef.current.remove()
      if (legendRef.current) legendRef.current.remove()
    }
  }, [map, loaded, wells, onMatchedWells, searchParcelApn])

  return null
}
