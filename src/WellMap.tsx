import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, useMap, LayersControl } from 'react-leaflet'
import type { Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Well } from './types'
import type { MapSearch } from './App'
import { haversineDistance, lookupParcelByApn, normalizeApnForParcel } from './hooks'
import ParcelLayer from './ParcelLayer'

const STOREY_CENTER: [number, number] = [39.358, -119.567]
const RADIUS_OPTIONS = [100, 200, 500, 1000, 2000]

const ZOOM_FOR_RADIUS: Record<number, number> = {
  100: 17,
  200: 16,
  500: 15,
  1000: 14,
  2000: 13,
}

function FlyTo({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()
  map.flyTo(center, zoom, { duration: 1 })
  return null
}

function formatRadius(r: number) {
  return r >= 1000 ? `${r / 1000}km` : `${r}m`
}

function formatDistance(km: number) {
  const m = Math.round(km * 1000)
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`
}

export default function WellMap({ wells, initialSearch }: { wells: Well[]; initialSearch?: MapSearch | null }) {
  const [searchText, setSearchText] = useState('')
  const [searchMode, setSearchMode] = useState<'address' | 'apn'>('address')
  const [searchCenter, setSearchCenter] = useState<[number, number] | null>(null)
  const [flyTarget, setFlyTarget] = useState<{ center: [number, number]; zoom: number } | null>(null)
  const [radius, setRadius] = useState(500)
  const [searching, setSearching] = useState(false)
  const [selectedWellId, setSelectedWellId] = useState<string | null>(null)
  const [, setParcelMatchedWells] = useState<Set<string>>(new Set())
  const [apnResult, setApnResult] = useState<{ wells: Well[]; parcelApn: string; acres: number } | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const appliedInitialSearch = useRef(false)

  useEffect(() => {
    if (initialSearch && !appliedInitialSearch.current) {
      appliedInitialSearch.current = true
      if (initialSearch.type === 'address') {
        setSearchMode('address')
        setSearchCenter(initialSearch.center)
        setRadius(initialSearch.radius)
        setFlyTarget({ center: initialSearch.center, zoom: ZOOM_FOR_RADIUS[initialSearch.radius] ?? 15 })
      } else {
        setSearchMode('apn')
        setSearchText(initialSearch.apn)
        handleApnSearch(initialSearch.apn)
      }
    }
  }, [initialSearch])

  const mappableWells = useMemo(
    () => wells.filter(w => w.lat != null && w.lng != null),
    [wells],
  )

  const nearbyWells = useMemo(() => {
    if (!searchCenter) return null
    return mappableWells
      .map(w => ({
        well: w,
        distance: haversineDistance(searchCenter[0], searchCenter[1], w.lat!, w.lng!),
      }))
      .filter(({ distance }) => distance <= radius / 1000)
      .sort((a, b) => a.distance - b.distance)
  }, [searchCenter, radius, mappableWells])

  const nearbyStats = useMemo(() => {
    if (!nearbyWells) return null
    const depths = nearbyWells.map(n => n.well.drillDepth).filter((d): d is number => d != null)
    const waters = nearbyWells.map(n => n.well.staticWaterLevel).filter((d): d is number => d != null)
    return {
      count: nearbyWells.length,
      avgDepth: depths.length ? Math.round(depths.reduce((a, b) => a + b, 0) / depths.length) : null,
      avgWater: waters.length ? Math.round(waters.reduce((a, b) => a + b, 0) / waters.length) : null,
    }
  }, [nearbyWells])

  const handleApnSearch = useCallback(async (apnOverride?: string) => {
    const apn = apnOverride || searchText.trim()
    if (!apn) return
    setSearching(true)
    setSelectedWellId(null)
    setApnResult(null)
    setSearchCenter(null)
    try {
      const result = await lookupParcelByApn(apn)
      if (result) {
        const matchedWells = wells.filter(w => {
          const pa = normalizeApnForParcel(w.apn)
          return pa === result.parcelApn
        })
        setApnResult({ wells: matchedWells, parcelApn: result.parcelApn, acres: result.acres })
        setFlyTarget({ center: result.center, zoom: 17 })
        setSearchCenter(result.center)
      } else {
        alert('Parcel not found. Try a different APN format (e.g. 003-331-10 or 333110).')
      }
    } catch {
      alert('Search failed. Check your internet connection.')
    } finally {
      setSearching(false)
    }
  }, [searchText, wells])

  const handleSearch = useCallback(async () => {
    if (!searchText.trim()) return
    if (searchMode === 'apn') {
      handleApnSearch()
      return
    }
    setSearching(true)
    setSelectedWellId(null)
    setApnResult(null)
    try {
      // 1. Try matching against our scanned addresses first (more accurate for VCH)
      const query = searchText.trim().toLowerCase()
      const queryNum = query.match(/^\d+/)?.[0]
      const queryStreet = query.replace(/^\d+\s*/, '').replace(/\s+(rd|road|dr|drive|st|street|ave|avenue|ln|lane|ct|court|way)\.?$/i, '').trim()

      const wellMatch = wells.find(w => {
        if (!w.scanAddress) return false
        const addr = w.scanAddress.toLowerCase()
        if (queryNum && !addr.startsWith(queryNum)) return false
        if (queryStreet && !addr.includes(queryStreet)) return false
        return true
      })

      if (wellMatch && wellMatch.parcelApn) {
        // We know the exact parcel via the well's APN — use APN-based highlight
        const result = await lookupParcelByApn(wellMatch.apn || wellMatch.parcelApn)
        if (result) {
          const matchedWells = wells.filter(w => {
            const pa = normalizeApnForParcel(w.apn)
            return pa === result.parcelApn
          })
          setApnResult({ wells: matchedWells, parcelApn: result.parcelApn, acres: result.acres })
          setFlyTarget({ center: result.center, zoom: 17 })
          setSearchCenter(result.center)
          return
        }
      }
      if (wellMatch && wellMatch.lat && wellMatch.lng) {
        const center: [number, number] = [wellMatch.lat, wellMatch.lng]
        setSearchCenter(center)
        setFlyTarget({ center, zoom: 17 })
        return
      }

      // 2. Fall back to Nominatim
      const geocodeQuery = `${searchText.trim()}, Storey County, Nevada`
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(geocodeQuery)}&limit=5&countrycodes=us&viewbox=-119.75,39.45,-119.45,39.25&bounded=1`,
      )
      const results = await resp.json()
      if (results.length > 0) {
        const { lat, lon } = results[0]
        const center: [number, number] = [parseFloat(lat), parseFloat(lon)]
        setSearchCenter(center)
        setFlyTarget({ center, zoom: ZOOM_FOR_RADIUS[radius] ?? 15 })
      } else {
        alert('Address not found. Try a road name or landmark in Storey County.')
      }
    } catch {
      alert('Search failed. Check your internet connection.')
    } finally {
      setSearching(false)
    }
  }, [searchText, radius, searchMode, handleApnSearch])

  const handleRadiusChange = useCallback((newRadius: number) => {
    setRadius(newRadius)
    if (searchCenter) {
      setFlyTarget({ center: searchCenter, zoom: ZOOM_FOR_RADIUS[newRadius] ?? 15 })
    }
  }, [searchCenter])

  const hasResults = nearbyWells != null || apnResult != null

  return (
    <div className="map-page">
      <div className="map-controls">
        <div className="search-toggle">
          <button className={searchMode === 'address' ? 'active' : ''} onClick={() => setSearchMode('address')}>Address</button>
          <button className={searchMode === 'apn' ? 'active' : ''} onClick={() => setSearchMode('apn')}>APN</button>
        </div>
        <input
          className="search-input"
          placeholder={searchMode === 'address' ? 'Enter address or road name...' : 'Enter APN (e.g. 003-331-10)'}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        {searchMode === 'address' && (
          <select className="radius-select" value={radius} onChange={e => handleRadiusChange(Number(e.target.value))}>
            {RADIUS_OPTIONS.map(r => (
              <option key={r} value={r}>{formatRadius(r)} radius</option>
            ))}
          </select>
        )}
        <button className="search-btn" onClick={handleSearch} disabled={searching}>
          {searching ? 'Searching...' : searchMode === 'apn' ? 'Look Up' : 'Search'}
        </button>
      </div>
      <div className={hasResults ? 'map-split' : 'map-body'}>
        <div className="map-container">
          <MapContainer
            center={STOREY_CENTER}
            zoom={12}
            style={{ height: '100%', width: '100%' }}
            ref={mapRef}
          >
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="Standard">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satellite">
                <TileLayer
                  attribution='Tiles &copy; Esri'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Topo">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                  url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
            </LayersControl>
            <ParcelLayer wells={mappableWells} onMatchedWells={setParcelMatchedWells} searchParcelApn={apnResult?.parcelApn ?? null} searchPoint={!apnResult && searchCenter ? searchCenter : null} />
            {flyTarget && <FlyTo center={flyTarget.center} zoom={flyTarget.zoom} />}
          </MapContainer>
        </div>
        {hasResults && (
          <div className="results-panel">
            {apnResult ? (
              <>
                <div className="results-header">
                  <div className="results-title">
                    Parcel <strong>{apnResult.parcelApn}</strong>
                  </div>
                  <div className="results-stat">
                    {apnResult.acres.toFixed(2)} acres · <strong>{apnResult.wells.length}</strong> well{apnResult.wells.length !== 1 ? 's' : ''} on record
                  </div>
                </div>
                <div className="results-list">
                  {apnResult.wells.length === 0 && (
                    <div className="results-empty">No wells found on this parcel.</div>
                  )}
                  {apnResult.wells.map(well => (
                    <WellCard key={well.id} well={well} selected={selectedWellId === well.id} onSelect={() => {
                      setSelectedWellId(well.id)
                      if (well.lat && well.lng) mapRef.current?.flyTo([well.lat, well.lng], 17, { duration: 0.5 })
                    }} />
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="results-header">
                  <div className="results-title">
                    <strong>{nearbyStats!.count}</strong> wells within {formatRadius(radius)}
                  </div>
                  {nearbyStats!.avgDepth != null && (
                    <div className="results-stat">
                      Avg depth <strong>{nearbyStats!.avgDepth}ft</strong>
                      {nearbyStats!.avgWater != null && <> · Water level <strong>{nearbyStats!.avgWater}ft</strong></>}
                    </div>
                  )}
                </div>
                <div className="results-list">
                  {nearbyWells!.length === 0 && (
                    <div className="results-empty">No wells found within {formatRadius(radius)}. Try a larger radius.</div>
                  )}
                  {nearbyWells!.map(({ well, distance }) => (
                    <WellCard key={well.id} well={well} distance={distance} selected={selectedWellId === well.id} onSelect={() => {
                      setSelectedWellId(well.id)
                      if (well.lat && well.lng) mapRef.current?.flyTo([well.lat, well.lng], Math.max(ZOOM_FOR_RADIUS[radius] ?? 15, 16), { duration: 0.5 })
                    }} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function confidenceBadge(confidence: string | null | undefined) {
  if (!confidence || confidence === 'unknown') return null
  const cls = confidence === 'high' ? 'badge-domestic' : confidence === 'medium' ? 'badge-other' : 'badge-geothermal'
  return <span className={`badge ${cls}`} style={{ fontSize: '0.6rem' }}>{confidence}</span>
}

function WellCard({ well, distance, selected, onSelect }: { well: Well; distance?: number; selected: boolean; onSelect: () => void }) {
  return (
    <div className={`result-card ${selected ? 'result-card-active' : ''}`} onClick={onSelect}>
      <div className="result-card-top">
        <span className="result-id">#{well.id}</span>
        <span style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
          {confidenceBadge(well.scanConfidence)}
          {distance != null && <span className="result-distance">{formatDistance(distance)}</span>}
        </span>
      </div>
      {well.scanAddress && <div className="result-address">{well.scanAddress}</div>}
      {well.owner && <div className="result-owner">{well.owner}</div>}
      <div className="result-details">
        {well.drillDepth != null && (
          <div className="result-detail">
            <span className="result-detail-label">Depth</span>
            <span className="result-detail-value">{well.drillDepth}ft</span>
          </div>
        )}
        {well.staticWaterLevel != null && (
          <div className="result-detail">
            <span className="result-detail-label">Water</span>
            <span className="result-detail-value">{well.staticWaterLevel}ft</span>
          </div>
        )}
        {well.completionDate && (
          <div className="result-detail">
            <span className="result-detail-label">Date</span>
            <span className="result-detail-value">{well.completionDate}</span>
          </div>
        )}
        {well.casingDiameter && (
          <div className="result-detail">
            <span className="result-detail-label">Casing</span>
            <span className="result-detail-value">{well.casingDiameter}"</span>
          </div>
        )}
      </div>
      <div className="result-tags">
        <span className={
          well.proposedUse === 'Domestic' ? 'badge badge-domestic' :
          well.proposedUse === 'Geothermal' ? 'badge badge-geothermal' :
          'badge badge-other'
        }>{well.proposedUse}</span>
        {well.workType && <span className="badge badge-other">{well.workType}</span>}
        {well.drillerName && <span className="result-driller">{well.drillerName}</span>}
        {well.pdfUrl && <a className="result-pdf" href={well.pdfUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>View Log</a>}
      </div>
    </div>
  )
}

