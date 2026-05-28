import { useMemo, useState } from 'react'
import type { Well } from './types'

type QualityFilter = 'all' | 'user_verified' | 'log_scanned' | 'parcel_matched' | 'no_match' | 'no_apn' | 'mismatch'

interface Stats {
  total: number
  user_verified: number
  log_scanned: number
  parcel_matched: number
  no_match: number
  no_apn: number
  has_address: number
  has_scan_apn: number
  apn_mismatch: number
  pre_gps_no_match: number
}

function computeStats(wells: Well[]): Stats {
  let s: Stats = {
    total: wells.length,
    user_verified: 0,
    log_scanned: 0,
    parcel_matched: 0,
    no_match: 0,
    no_apn: 0,
    has_address: 0,
    has_scan_apn: 0,
    apn_mismatch: 0,
    pre_gps_no_match: 0,
  }
  for (const w of wells) {
    if (w.gpsSource === 'user_verified') s.user_verified++
    if (w.dataQuality === 'log_scanned') s.log_scanned++
    if (w.dataQuality === 'parcel_matched') s.parcel_matched++
    if (w.dataQuality === 'no_match') s.no_match++
    if (w.dataQuality === 'no_apn') s.no_apn++
    if (w.scanAddress) s.has_address++
    if (w.scanApn) s.has_scan_apn++
    if (w.scanApn && w.apn && normalizeApn(w.scanApn) !== normalizeApn(w.apn)) s.apn_mismatch++
    if (w.dataQuality === 'no_match' && w.completionDate) {
      const year = parseInt(w.completionDate.split('/')[2])
      if (year < 1990) s.pre_gps_no_match++
    }
  }
  return s
}

function normalizeApn(apn: string): string {
  if (!apn) return ''
  const parts = apn.replace(/\s/g, '-').split('-')
  if (parts.length === 3) return `${parseInt(parts[0])}-${parts[1]}-${parts[2]}`
  return apn
}

function gpsDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function DataAdmin({ wells }: { wells: Well[] }) {
  const [filter, setFilter] = useState<QualityFilter>('all')
  const [search, setSearch] = useState('')
  const stats = useMemo(() => computeStats(wells), [wells])

  const filtered = useMemo(() => {
    let result = wells
    if (filter === 'user_verified') result = result.filter(w => w.gpsSource === 'user_verified')
    else if (filter === 'log_scanned') result = result.filter(w => w.dataQuality === 'log_scanned')
    else if (filter === 'parcel_matched') result = result.filter(w => w.dataQuality === 'parcel_matched')
    else if (filter === 'no_match') result = result.filter(w => w.dataQuality === 'no_match')
    else if (filter === 'no_apn') result = result.filter(w => w.dataQuality === 'no_apn')
    else if (filter === 'mismatch') result = result.filter(w =>
      w.scanApn && w.apn && normalizeApn(w.scanApn) !== normalizeApn(w.apn)
    )

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(w =>
        w.id.includes(q) ||
        w.apn?.toLowerCase().includes(q) ||
        w.scanApn?.toLowerCase().includes(q) ||
        w.scanAddress?.toLowerCase().includes(q) ||
        w.owner?.toLowerCase().includes(q) ||
        w.scanOwner?.toLowerCase().includes(q)
      )
    }
    return result
  }, [wells, filter, search])

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h2>Data Admin (internal)</h2>
        <p>Inspection view — not linked from public nav. Showing data quality breakdown and per-well mappings.</p>
      </div>

      <div className="admin-stats">
        <button className={`admin-stat ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          <div className="admin-stat-label">Total</div>
          <div className="admin-stat-value">{stats.total}</div>
        </button>
        <button className={`admin-stat verified ${filter === 'user_verified' ? 'active' : ''}`} onClick={() => setFilter('user_verified')}>
          <div className="admin-stat-label">User Verified GPS</div>
          <div className="admin-stat-value">{stats.user_verified}</div>
        </button>
        <button className={`admin-stat scanned ${filter === 'log_scanned' ? 'active' : ''}`} onClick={() => setFilter('log_scanned')}>
          <div className="admin-stat-label">Log Scanned</div>
          <div className="admin-stat-value">{stats.log_scanned}</div>
        </button>
        <button className={`admin-stat matched ${filter === 'parcel_matched' ? 'active' : ''}`} onClick={() => setFilter('parcel_matched')}>
          <div className="admin-stat-label">Parcel Matched</div>
          <div className="admin-stat-value">{stats.parcel_matched}</div>
        </button>
        <button className={`admin-stat warning ${filter === 'no_match' ? 'active' : ''}`} onClick={() => setFilter('no_match')}>
          <div className="admin-stat-label">APN No Match</div>
          <div className="admin-stat-value">{stats.no_match}</div>
        </button>
        <button className={`admin-stat warning ${filter === 'no_apn' ? 'active' : ''}`} onClick={() => setFilter('no_apn')}>
          <div className="admin-stat-label">No APN</div>
          <div className="admin-stat-value">{stats.no_apn}</div>
        </button>
        <button className={`admin-stat danger ${filter === 'mismatch' ? 'active' : ''}`} onClick={() => setFilter('mismatch')}>
          <div className="admin-stat-label">APN Mismatch (DB ≠ Log)</div>
          <div className="admin-stat-value">{stats.apn_mismatch}</div>
        </button>
      </div>

      <div className="admin-extras">
        <div>Has scanned address: <strong>{stats.has_address}</strong></div>
        <div>Has scanned APN: <strong>{stats.has_scan_apn}</strong></div>
        <div>Pre-1990 + no parcel match: <strong>{stats.pre_gps_no_match}</strong></div>
      </div>

      <div className="admin-controls">
        <input
          className="search-input"
          placeholder="Search by log #, APN, owner, address..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="admin-count">{filtered.length.toLocaleString()} wells</span>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Log #</th>
              <th>Year</th>
              <th>DB APN</th>
              <th>Log APN</th>
              <th>Parcel APN</th>
              <th>Address</th>
              <th>Quality</th>
              <th>GPS Source</th>
              <th>NDWR GPS</th>
              <th>Parcel Centroid</th>
              <th>Scan GPS</th>
              <th>Verified GPS</th>
              <th>Drift</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map(w => {
              const year = w.completionDate?.split('/')[2] ?? ''
              const dbApn = w.apn || '—'
              const logApn = w.scanApn || '—'
              const apnMatch = w.scanApn && w.apn && normalizeApn(w.scanApn) === normalizeApn(w.apn)
              const apnMismatch = w.scanApn && w.apn && normalizeApn(w.scanApn) !== normalizeApn(w.apn)

              let drift = ''
              if (w.originalLat && w.originalLng && w.parcelLat && w.parcelLng) {
                const d = gpsDistanceMiles(w.originalLat, w.originalLng, w.parcelLat, w.parcelLng)
                drift = d > 0.01 ? `${(d * 5280).toFixed(0)}ft` : '—'
              }

              return (
                <tr key={w.id}>
                  <td className="mono">{w.id}</td>
                  <td>{year}</td>
                  <td className={`mono ${apnMismatch ? 'cell-danger' : apnMatch ? 'cell-good' : ''}`}>{dbApn}</td>
                  <td className={`mono ${apnMatch ? 'cell-good' : apnMismatch ? 'cell-danger' : ''}`}>{logApn}</td>
                  <td className="mono">{w.parcelApn || '—'}</td>
                  <td>{w.scanAddress || '—'}</td>
                  <td><QualityBadge q={w.dataQuality} /></td>
                  <td>{w.gpsSource || '—'}</td>
                  <td className="mono">{w.originalLat ? `${w.originalLat?.toFixed(4)}, ${w.originalLng?.toFixed(4)}` : '—'}</td>
                  <td className="mono">{w.parcelLat ? `${w.parcelLat?.toFixed(4)}, ${w.parcelLng?.toFixed(4)}` : '—'}</td>
                  <td className="mono">{w.scanLat ? `${w.scanLat?.toFixed(4)}, ${w.scanLng?.toFixed(4)}` : '—'}</td>
                  <td className="mono cell-good">{w.verifiedLat ? `${w.verifiedLat?.toFixed(4)}, ${w.verifiedLng?.toFixed(4)}` : '—'}</td>
                  <td className={drift && parseInt(drift) > 500 ? 'cell-warning' : ''}>{drift}</td>
                  <td>{w.pdfUrl && <a href={w.pdfUrl} target="_blank" rel="noopener noreferrer">PDF</a>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length > 200 && (
          <div className="admin-truncated">Showing first 200 of {filtered.length.toLocaleString()}. Refine filter or search to see more.</div>
        )}
      </div>
    </div>
  )
}

function QualityBadge({ q }: { q: string | undefined }) {
  if (!q) return <span>—</span>
  const cls = {
    user_verified: 'badge-domestic',
    log_scanned: 'badge-other',
    log_verified: 'badge-domestic',
    parcel_matched: 'badge-other',
    no_match: 'badge-geothermal',
    no_apn: 'badge-geothermal',
  }[q] || 'badge-other'
  return <span className={`badge ${cls}`}>{q.replace(/_/g, ' ')}</span>
}
