import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Well } from './types'

const PARCEL_URL = 'https://arcgis.water.nv.gov/arcgis/rest/services/BaseLayers/County_Parcels_in_Nevada/MapServer/0/query'
const MIN_ZOOM = 14

const DEPTH_COLORS = {
  shallow: '#22c55e',
  medium: '#eab308',
  deep: '#f97316',
  veryDeep: '#ef4444',
  none: '#6366f1',
}

function depthColor(depth: number | null) {
  if (depth == null) return DEPTH_COLORS.none
  if (depth < 100) return DEPTH_COLORS.shallow
  if (depth <= 300) return DEPTH_COLORS.medium
  if (depth <= 500) return DEPTH_COLORS.deep
  return DEPTH_COLORS.veryDeep
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

function matchWellToParcel(well: Well, feature: GeoJSON.Feature): boolean {
  if (!well.lat || !well.lng || !feature.geometry) return false
  const geom = feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon
  if (geom.type === 'Polygon') {
    return pointInPolygon(well.lat, well.lng, geom.coordinates[0])
  }
  if (geom.type === 'MultiPolygon') {
    return geom.coordinates.some(poly => pointInPolygon(well.lat!, well.lng!, poly[0]))
  }
  return false
}

export default function ParcelLayer({ wells, onMatchedWells }: { wells: Well[]; onMatchedWells: (ids: Set<string>) => void }) {
  const map = useMap()
  const layerRef = useRef<L.GeoJSON | null>(null)
  const legendRef = useRef<L.Control | null>(null)
  const [loaded, setLoaded] = useState(false)
  const fetchingRef = useRef(false)

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

        const matchedIds = new Set<string>()
        const parcelWells = new Map<number, Well[]>()

        for (let fi = 0; fi < data.features.length; fi++) {
          const feature = data.features[fi]
          for (const well of wells) {
            if (matchWellToParcel(well, feature)) {
              matchedIds.add(well.id)
              if (!parcelWells.has(fi)) parcelWells.set(fi, [])
              parcelWells.get(fi)!.push(well)
            }
          }
        }

        onMatchedWells(matchedIds)

        layerRef.current = L.geoJSON(data, {
          style: (feature) => {
            const fi = data.features.indexOf(feature!)
            const matched = parcelWells.get(fi)
            if (matched && matched.length > 0) {
              const deepest = matched.reduce((max, w) =>
                (w.drillDepth ?? 0) > (max.drillDepth ?? 0) ? w : max, matched[0])
              const color = depthColor(deepest.drillDepth)
              return { color, weight: 2, opacity: 0.8, fillOpacity: 0.25, fillColor: color }
            }
            return { color: '#9ca3af', weight: 0.5, opacity: 0.3, fillOpacity: 0, fillColor: 'transparent' }
          },
          onEachFeature: (feature, layer) => {
            const fi = data.features.indexOf(feature)
            const matched = parcelWells.get(fi)
            const props = feature.properties
            let html = `<div class="well-popup"><h3>Parcel</h3><dl class="meta">`
            if (props?.APN) html += `<dt>APN</dt><dd>${props.APN}</dd>`
            if (props?.Acres) html += `<dt>Acres</dt><dd>${props.Acres.toFixed(2)}</dd>`
            if (matched && matched.length > 0) {
              html += `<dt>Wells</dt><dd>${matched.length}</dd>`
              for (const w of matched) {
                html += `<dt>Log #${w.id}</dt><dd>${w.drillDepth ?? '?'}ft deep${w.staticWaterLevel != null ? `, water at ${w.staticWaterLevel}ft` : ''}</dd>`
              }
            }
            html += `</dl></div>`
            layer.bindPopup(html)
          },
        })

        const legend = new L.Control({ position: 'bottomright' })
        legend.onAdd = () => {
          const div = L.DomUtil.create('div', 'parcel-legend')
          div.innerHTML = `
            <strong>Well Depth</strong>
            <div><span style="background:${DEPTH_COLORS.shallow}"></span> &lt; 100ft</div>
            <div><span style="background:${DEPTH_COLORS.medium}"></span> 100–300ft</div>
            <div><span style="background:${DEPTH_COLORS.deep}"></span> 300–500ft</div>
            <div><span style="background:${DEPTH_COLORS.veryDeep}"></span> 500ft+</div>
            <div><span style="background:#9ca3af"></span> No well data</div>
          `
          return div
        }
        legendRef.current = legend

        setLoaded(true)
        updateVisibility()
      } catch {
        // Silently fail
      }
    }

    loadParcels()
    map.on('zoomend', updateVisibility)
    return () => {
      map.off('zoomend', updateVisibility)
      legendRef.current?.remove()
    }
  }, [map, loaded, wells, onMatchedWells])

  return null
}
