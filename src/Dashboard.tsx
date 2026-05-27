import { useState, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { Well } from './types'
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

export default function Dashboard({ wells, onSearch }: { wells: Well[]; onSearch: (center: [number, number], radius: number) => void }) {
  const stats = useWellStats(wells)
  const [searchText, setSearchText] = useState('')
  const [searching, setSearching] = useState(false)
  const [radius, setRadius] = useState(500)

  const depthData = Object.entries(stats.depthBuckets)
    .map(([name, count]) => ({ name, count }))

  const handleSearch = useCallback(async () => {
    if (!searchText.trim()) return
    setSearching(true)
    try {
      const query = `${searchText.trim()}, Storey County, Nevada`
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      )
      const results = await resp.json()
      if (results.length > 0) {
        const { lat, lon } = results[0]
        onSearch([parseFloat(lat), parseFloat(lon)], radius)
      } else {
        alert('Address not found. Try a road name or landmark in Storey County.')
      }
    } catch {
      alert('Search failed. Check your internet connection.')
    } finally {
      setSearching(false)
    }
  }, [searchText, radius, onSearch])

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
        <h3>Find wells near your property</h3>
        <p>Enter an address to see nearby well depths, water levels, and drilling history on an interactive map.</p>
        <div className="cta-search-row">
          <input
            className="cta-search-input"
            placeholder="e.g. 123 Lousetown Rd, Virginia City"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <select className="radius-select" value={radius} onChange={e => setRadius(Number(e.target.value))}>
            {RADIUS_OPTIONS.map(r => (
              <option key={r} value={r}>{formatRadius(r)}</option>
            ))}
          </select>
          <button className="cta-search-btn" onClick={handleSearch} disabled={searching}>
            {searching ? 'Searching...' : 'Find Nearby Wells'}
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

      <footer className="footer">
        <p>
          This site is built using publicly available well log data from
          the <a href="https://water.nv.gov" target="_blank" rel="noopener noreferrer">Nevada Division of Water Resources</a>.
          The authors make no claim of ownership over this data and provide it as-is for informational purposes only.
          No guarantee is made regarding the accuracy, completeness, or timeliness of the information presented.
          This site is not affiliated with or endorsed by the State of Nevada, Storey County, or any government agency.
          Do not rely on this data for permitting, drilling, legal, or financial decisions — always consult
          the official NDWR records and a licensed professional.
        </p>
      </footer>
    </div>
  )
}
