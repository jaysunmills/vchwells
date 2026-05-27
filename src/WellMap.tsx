import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Circle, useMap, LayersControl } from 'react-leaflet'
import type { Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Well } from './types'
import type { MapSearch } from './App'
import { haversineDistance } from './hooks'

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

function markerColor(well: Well) {
  if (well.proposedUse === 'Geothermal') return '#fb923c'
  if (well.proposedUse === 'Domestic') return '#38bdf8'
  return '#a78bfa'
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
  const [searchCenter, setSearchCenter] = useState<[number, number] | null>(null)
  const [flyTarget, setFlyTarget] = useState<{ center: [number, number]; zoom: number } | null>(null)
  const [radius, setRadius] = useState(500)
  const [searching, setSearching] = useState(false)
  const [selectedWellId, setSelectedWellId] = useState<string | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const appliedInitialSearch = useRef(false)

  useEffect(() => {
    if (initialSearch && !appliedInitialSearch.current) {
      appliedInitialSearch.current = true
      setSearchCenter(initialSearch.center)
      setRadius(initialSearch.radius)
      setFlyTarget({ center: initialSearch.center, zoom: ZOOM_FOR_RADIUS[initialSearch.radius] ?? 15 })
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

  const handleSearch = useCallback(async () => {
    if (!searchText.trim()) return
    setSearching(true)
    setSelectedWellId(null)
    try {
      const query = `${searchText.trim()}, Storey County, Nevada`
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
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
  }, [searchText, radius])

  const handleRadiusChange = useCallback((newRadius: number) => {
    setRadius(newRadius)
    if (searchCenter) {
      setFlyTarget({ center: searchCenter, zoom: ZOOM_FOR_RADIUS[newRadius] ?? 15 })
    }
  }, [searchCenter])

  const hasResults = nearbyWells != null

  return (
    <div className="map-page">
      <div className="map-controls">
        <input
          className="search-input"
          placeholder="Enter address or road name (e.g. Lousetown Rd, Virginia City)"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <select className="radius-select" value={radius} onChange={e => handleRadiusChange(Number(e.target.value))}>
          {RADIUS_OPTIONS.map(r => (
            <option key={r} value={r}>{formatRadius(r)} radius</option>
          ))}
        </select>
        <button className="search-btn" onClick={handleSearch} disabled={searching}>
          {searching ? 'Searching...' : 'Search'}
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
            {flyTarget && <FlyTo center={flyTarget.center} zoom={flyTarget.zoom} />}
            {searchCenter && (
              <Circle
                center={searchCenter}
                radius={radius}
                pathOptions={{ color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.08, weight: 2, dashArray: '8 4' }}
              />
            )}
            {searchCenter && (
              <CircleMarker
                center={searchCenter}
                radius={8}
                pathOptions={{ color: '#f43f5e', fillColor: '#f43f5e', fillOpacity: 1, weight: 2 }}
              >
                <Popup>
                  <div className="well-popup"><h3>Search Location</h3></div>
                </Popup>
              </CircleMarker>
            )}
            {mappableWells.map(well => (
              <CircleMarker
                key={well.id}
                center={[well.lat!, well.lng!]}
                radius={selectedWellId === well.id ? 8 : 5}
                pathOptions={{
                  color: selectedWellId === well.id ? '#fff' : markerColor(well),
                  fillColor: markerColor(well),
                  fillOpacity: selectedWellId === well.id ? 1 : 0.7,
                  weight: selectedWellId === well.id ? 2 : 1,
                }}
                eventHandlers={{ click: () => setSelectedWellId(well.id) }}
              >
                <Popup>
                  <WellPopup well={well} />
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
        {hasResults && (
          <div className="results-panel">
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
                <div
                  key={well.id}
                  className={`result-card ${selectedWellId === well.id ? 'result-card-active' : ''}`}
                  onClick={() => {
                    setSelectedWellId(well.id)
                    if (well.lat && well.lng) {
                      mapRef.current?.flyTo([well.lat, well.lng], Math.max(ZOOM_FOR_RADIUS[radius] ?? 15, 16), { duration: 0.5 })
                    }
                  }}
                >
                  <div className="result-card-top">
                    <span className="result-id">#{well.id}</span>
                    <span className="result-distance">{formatDistance(distance)}</span>
                  </div>
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function WellPopup({ well }: { well: Well }) {
  return (
    <div className="well-popup">
      <h3>Well Log #{well.id}</h3>
      <dl className="meta">
        {well.owner && <><dt>Owner</dt><dd>{well.owner}</dd></>}
        {well.drillDepth != null && <><dt>Drill Depth</dt><dd>{well.drillDepth} ft</dd></>}
        {well.staticWaterLevel != null && <><dt>Water Level</dt><dd>{well.staticWaterLevel} ft</dd></>}
        {well.completionDate && <><dt>Completed</dt><dd>{well.completionDate}</dd></>}
        {well.drillerName && <><dt>Driller</dt><dd>{well.drillerName}</dd></>}
        {well.workType && <><dt>Type</dt><dd>{well.workType}</dd></>}
        {well.casingDiameter && <><dt>Casing</dt><dd>{well.casingDiameter}"</dd></>}
        <dt>Location</dt><dd>T{well.township} R{well.range} S{well.section} {well.quarterQuarter}</dd>
        <dt>Basin</dt><dd>{well.basinName}</dd>
        {well.apn && <><dt>APN</dt><dd>{well.apn}</dd></>}
      </dl>
    </div>
  )
}
