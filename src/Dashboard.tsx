import { useState, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { Well } from './types'
import type { MapSearch } from './App'
import { useWellStats } from './hooks'

const TOOLTIP_STYLE = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#111827' }
const TICK_STYLE = { fill: '#6b7280', fontSize: 12 }
const RADIUS_OPTIONS = [100, 200, 500, 1000, 2000]

const RESOURCES = [
  {
    title: 'Jason Mills — AI Consulting',
    desc: 'This site was built by Jason Mills, a local VCH resident. Need a data tool or AI solution for your business? Get in touch.',
    url: 'mailto:jason@jasonmills.io',
    tag: 'Built by',
    featured: true,
  },
  {
    title: 'NDWR Well Log Query',
    desc: 'Search the full Nevada Division of Water Resources well log database — the source of this data.',
    url: 'https://tools.water.nv.gov/WellLogQuery.aspx',
    tag: 'State Database',
  },
  {
    title: 'Nevada Division of Water Resources',
    desc: 'State agency overseeing water rights, well permits, and groundwater management in Nevada.',
    url: 'https://water.nv.gov',
    tag: 'State Agency',
  },
  {
    title: 'USGS Groundwater Data for Nevada',
    desc: 'Real-time and historical groundwater level data from USGS monitoring wells across Nevada.',
    url: 'https://waterdata.usgs.gov/state/nevada/?type=gw',
    tag: 'Federal Data',
  },
  {
    title: 'Storey County Water Resources',
    desc: 'Storey County water and sewer services, water quality reports, and connection procedures.',
    url: 'https://storeycounty.org/340/Water',
    tag: 'County',
  },
  {
    title: 'NBMG: Hydrogeology of Storey County',
    desc: 'Nevada Bureau of Mines & Geology publications and maps covering the hydrogeology of the Virginia Range area.',
    url: 'https://pubs.nbmg.unr.edu/',
    tag: 'Research',
  },
  {
    title: 'USGS Water Resources of Washoe/Storey Area',
    desc: 'USGS scientific investigations and reports on groundwater conditions in the Truckee Meadows and surrounding basins.',
    url: 'https://www.usgs.gov/centers/nevada-water-science-center',
    tag: 'Studies',
  },
  {
    title: 'NV Well Driller Licensing',
    desc: 'Verify driller licenses and look up licensed well drillers operating in Nevada.',
    url: 'https://water.nv.gov/index.php/programs/well-drilling/well-driller-licensing',
    tag: 'Licensing',
  },
  {
    title: 'Nevada Well Standards',
    desc: 'NAC 534 — Nevada Administrative Code governing well construction, abandonment, and water quality standards.',
    url: 'https://www.leg.state.nv.us/nac/nac-534.html',
    tag: 'Regulations',
  },
]

function formatRadius(r: number) {
  return r >= 1000 ? `${r / 1000}km` : `${r}m`
}

export default function Dashboard({ wells, onSearch, onShowTerms }: { wells: Well[]; onSearch: (search: MapSearch) => void; onShowTerms: () => void }) {
  const stats = useWellStats(wells)
  const [searchText, setSearchText] = useState('')
  const [searchMode, setSearchMode] = useState<'address' | 'apn'>('address')
  const [searching, setSearching] = useState(false)
  const [radius, setRadius] = useState(500)

  const depthData = Object.entries(stats.depthBuckets)
    .map(([name, count]) => ({ name, count }))

  const handleSearch = useCallback(async () => {
    if (!searchText.trim()) return
    if (searchMode === 'apn') {
      onSearch({ type: 'apn', apn: searchText.trim() })
      return
    }
    setSearching(true)
    try {
      // 1. Try matching against scanned addresses first (more accurate for VCH)
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

      if (wellMatch && wellMatch.apn) {
        // We have a matching parcel — search by APN to highlight the exact parcel
        onSearch({ type: 'apn', apn: wellMatch.apn })
        return
      }
      if (wellMatch && wellMatch.lat && wellMatch.lng) {
        onSearch({ type: 'address', center: [wellMatch.lat, wellMatch.lng], radius })
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
        onSearch({ type: 'address', center: [parseFloat(lat), parseFloat(lon)], radius })
      } else {
        alert('Address not found. Try a road name or landmark in Storey County.')
      }
    } catch {
      alert('Search failed. Check your internet connection.')
    } finally {
      setSearching(false)
    }
  }, [searchText, radius, searchMode, onSearch, wells])

  return (
    <div className="dashboard">
      <div className="dashboard-hero" style={{ backgroundImage: 'url(/hero.jpg)' }}>
        <div className="hero-overlay">
          <h2>Virginia City Highlands Well Explorer</h2>
          <p>
            Explore {stats.total.toLocaleString()} well logs in the Virginia City Highlands area,
            from the Nevada Division of Water Resources — spanning {stats.oldestYear} to {stats.newestYear}.
          </p>
        </div>
      </div>

      <div className="cta-search">
        <div className="cta-disclaimer">
          <strong>Important:</strong> Data is sourced from publicly available Nevada Division of Water Resources records,
          enhanced with parcel boundaries from the state GIS service and selectively verified against original scanned well logs.
          The source data has known accuracy issues — older wells (pre-1990) often have inaccurate GPS coordinates, and some
          APNs in the state database have transcription errors.
          <strong> Do not use this tool to make financial, legal, drilling, or property decisions.</strong>
          See <button className="link-button" onClick={onShowTerms}>full terms</button>.
        </div>
        <h3>Find wells near your property</h3>
        <p>Search by address to see nearby wells, or look up a specific parcel by APN.</p>
        <div className="cta-search-row">
          <div className="search-toggle">
            <button className={searchMode === 'address' ? 'active' : ''} onClick={() => setSearchMode('address')}>Address</button>
            <button className={searchMode === 'apn' ? 'active' : ''} onClick={() => setSearchMode('apn')}>APN</button>
          </div>
          <input
            className="cta-search-input"
            placeholder={searchMode === 'address' ? 'e.g. 123 Lousetown Rd, Virginia City' : 'e.g. 003-331-10'}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          {searchMode === 'address' && (
            <select className="radius-select" value={radius} onChange={e => setRadius(Number(e.target.value))}>
              {RADIUS_OPTIONS.map(r => (
                <option key={r} value={r}>{formatRadius(r)}</option>
              ))}
            </select>
          )}
          <button className="cta-search-btn" onClick={handleSearch} disabled={searching}>
            {searching ? 'Searching...' : searchMode === 'apn' ? 'Look Up Parcel' : 'Find Nearby Wells'}
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total Wells</div>
          <div className="value">{stats.total.toLocaleString()}</div>
          <div className="sub">{stats.oldestYear}–{stats.newestYear}</div>
        </div>
        <div className="stat-card">
          <div className="label">Avg Drill Depth</div>
          <div className="value">{stats.avgDepth}ft</div>
          <div className="sub">Median: {stats.medianDepth}ft</div>
        </div>
        <div className="stat-card">
          <div className="label">Avg Water Level</div>
          <div className="value">{stats.avgWater}ft</div>
          <div className="sub">Median: {stats.medianWater}ft</div>
        </div>
        <div className="stat-card">
          <div className="label">Deepest Well</div>
          <div className="value">{stats.maxDepth.toLocaleString()}ft</div>
          <div className="sub">Log #{wells.find(w => w.drillDepth === stats.maxDepth)?.id}</div>
        </div>
      </div>

      <div className="quality-section">
        <h3>Data Quality</h3>
        <p className="quality-intro">How much of the well data can we trust at the parcel level?</p>
        <div className="quality-bar">
          <div className="quality-segment verified" style={{ flex: stats.quality.userVerified }} title={`${stats.quality.userVerified} user verified`} />
          <div className="quality-segment scanned" style={{ flex: stats.quality.logScanned }} title={`${stats.quality.logScanned} log scanned`} />
          <div className="quality-segment matched" style={{ flex: stats.quality.parcelMatched }} title={`${stats.quality.parcelMatched} parcel matched`} />
          <div className="quality-segment unmatched" style={{ flex: stats.total - stats.quality.userVerified - stats.quality.logScanned - stats.quality.parcelMatched }} title="No parcel match" />
        </div>
        <div className="quality-legend">
          <div><span className="qd verified"></span><strong>{stats.quality.userVerified}</strong> User verified GPS</div>
          <div><span className="qd scanned"></span><strong>{stats.quality.logScanned}</strong> Log scanned (PDF read)</div>
          <div><span className="qd matched"></span><strong>{stats.quality.parcelMatched}</strong> Parcel matched (by APN)</div>
          <div><span className="qd unmatched"></span><strong>{stats.total - stats.quality.userVerified - stats.quality.logScanned - stats.quality.parcelMatched}</strong> Unmatched (no APN or no parcel)</div>
        </div>
      </div>

      <div className="about-section data-notice">
        <h3>A Note on Data Accuracy</h3>
        <p>
          Our data process to enhance the raw NDWR records:
        </p>
        <ul>
          <li>Importing raw well log records from the NDWR Well Log Query system</li>
          <li>Matching wells to parcel boundaries using the state assessor's parcel number (APN)</li>
          <li>Looking up parcel centroids from the official Nevada GIS service to correct known GPS coordinate issues</li>
          <li>Selectively reading the original scanned well log PDFs to verify APNs, addresses, and well data</li>
        </ul>
        <p>
          Even with these steps, the source data has known limitations you should be aware of:
        </p>
        <ul>
          <li>
            <strong>These are drilling attempts, not necessarily producing wells.</strong> Some
            records represent boreholes that came up dry. A pin on the map does not mean there is an
            active well at that location.
          </li>
          <li>
            <strong>Well locations may be inaccurate.</strong> Many older wells were logged before GPS
            existed. Locations were estimated using the Public Land Survey System (PLSS), often only to
            the nearest quarter-quarter section — which can place a pin hundreds of feet from the actual
            well. The USGS has confirmed this is a known issue in the NDWR database.
          </li>
          <li>
            <strong>The well probably exists, just not exactly where the map shows it.</strong> If you
            see a well on your property that you don't recognize, check the log's completion date and
            APN — the original well report can usually be traced through
            the <a href="https://tools.water.nv.gov/WellLogQuery.aspx" target="_blank" rel="noopener noreferrer">NDWR well log search</a> or
            the <a href="https://storeycounty.org" target="_blank" rel="noopener noreferrer">county assessor records</a>.
          </li>
        </ul>
        <p>
          Use this tool as a starting point for research, not as a definitive record. For anything
          involving permits, drilling decisions, or property transactions, always verify with the
          official NDWR records and a licensed professional.
        </p>
      </div>

      <div className="chart-section">
        <h3>Drill Depth Distribution</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={depthData}>
            <XAxis dataKey="name" tick={{ ...TICK_STYLE, fontSize: 11 }} />
            <YAxis tick={TICK_STYLE} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-section">
        <h3>Resources & Studies</h3>
        <div className="resources-grid">
          {RESOURCES.map(r => (
            <a key={r.url} className={`resource-card ${'featured' in r && r.featured ? 'resource-card-featured' : ''}`} href={r.url} target="_blank" rel="noopener noreferrer">
              <div className="resource-card-title">{r.title}</div>
              <div className="resource-card-desc">{r.desc}</div>
              <span className="resource-card-tag">{r.tag}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="about-section">
        <h3>About This Site</h3>
        <p>
          Built by a local resident who was shopping for property in Virginia City Highlands and got
          frustrated trying to make sense of the state's well log data. The government websites have the
          information, but good luck actually finding what you need. So this happened — a simple tool that
          takes publicly available well log data from the Nevada Division of Water Resources and makes it
          searchable by address, visible on a map, and broken down into the numbers that actually matter
          when you're looking at land or planning a well. Whether you're a homeowner exploring your options,
          a buyer doing due diligence, or just curious about the water under your feet, this is for you.
          Currently this site only covers the Virginia City Highlands area. Owner names have been
          abbreviated for privacy. Data last refreshed May 27, 2026.
        </p>
      </div>

      <footer className="footer-mini">
        <p>
          Data sourced from <a href="https://water.nv.gov" target="_blank" rel="noopener noreferrer">Nevada Division of Water Resources</a> ·
          Last refreshed May 27, 2026 ·
          Built by <a href="mailto:jason@jasonmills.io">Jason Mills</a> ·
          <button className="link-button" onClick={onShowTerms}>Terms & Disclaimer</button>
        </p>
      </footer>
    </div>
  )
}
