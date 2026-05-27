import { useState, useMemo } from 'react'
import type { Well } from './types'

type SortKey = 'id' | 'owner' | 'drillDepth' | 'staticWaterLevel' | 'completionDate' | 'drillerName' | 'proposedUse' | 'basinName'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 50

export default function WellTable({ wells }: { wells: Well[] }) {
  const [filter, setFilter] = useState('')
  const [useFilter, setUseFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('completionDate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)

  const uses = useMemo(() => {
    const set = new Set(wells.map(w => w.proposedUse).filter(Boolean))
    return Array.from(set).sort()
  }, [wells])

  const filtered = useMemo(() => {
    const q = filter.toLowerCase()
    return wells.filter(w => {
      if (useFilter !== 'all' && w.proposedUse !== useFilter) return false
      if (!q) return true
      return (
        w.owner.toLowerCase().includes(q) ||
        w.id.includes(q) ||
        w.drillerName.toLowerCase().includes(q) ||
        w.apn.toLowerCase().includes(q) ||
        w.basinName.toLowerCase().includes(q)
      )
    })
  }, [wells, filter, useFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number | null = a[sortKey]
      let bv: string | number | null = b[sortKey]
      if (sortKey === 'completionDate') {
        av = av ? new Date(av as string).getTime() : 0
        bv = bv ? new Date(bv as string).getTime() : 0
      }
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
    setPage(0)
  }

  const maxDepth = Math.max(...wells.map(w => w.drillDepth ?? 0))

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <div className="table-page">
      <div className="table-controls">
        <input
          className="search-input"
          placeholder="Filter by owner, log #, driller, APN, or basin..."
          value={filter}
          onChange={e => { setFilter(e.target.value); setPage(0) }}
        />
        <select className="radius-select" value={useFilter} onChange={e => { setUseFilter(e.target.value); setPage(0) }}>
          <option value="all">All Uses</option>
          {uses.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <span style={{ color: '#94a3b8', fontSize: '0.85rem', alignSelf: 'center' }}>
          {sorted.length.toLocaleString()} wells
        </span>
      </div>
      <div className="well-table-wrap">
        <table className="well-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('id')}>Log #{sortIndicator('id')}</th>
              <th onClick={() => handleSort('owner')}>Owner{sortIndicator('owner')}</th>
              <th onClick={() => handleSort('drillDepth')}>Depth{sortIndicator('drillDepth')}</th>
              <th onClick={() => handleSort('staticWaterLevel')}>Water Level{sortIndicator('staticWaterLevel')}</th>
              <th onClick={() => handleSort('completionDate')}>Date{sortIndicator('completionDate')}</th>
              <th onClick={() => handleSort('drillerName')}>Driller{sortIndicator('drillerName')}</th>
              <th onClick={() => handleSort('proposedUse')}>Use{sortIndicator('proposedUse')}</th>
              <th onClick={() => handleSort('basinName')}>Basin{sortIndicator('basinName')}</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(w => (
              <tr key={w.id}>
                <td style={{ color: '#38bdf8', fontWeight: 600 }}>{w.id}</td>
                <td>{w.owner}</td>
                <td>
                  {w.drillDepth != null && (
                    <>
                      <span className="depth-bar" style={{ width: `${(w.drillDepth / maxDepth) * 60}px` }} />
                      {w.drillDepth}ft
                    </>
                  )}
                </td>
                <td>{w.staticWaterLevel != null ? `${w.staticWaterLevel}ft` : '—'}</td>
                <td>{w.completionDate || '—'}</td>
                <td>{w.drillerName || '—'}</td>
                <td>
                  <span className={
                    w.proposedUse === 'Domestic' ? 'badge badge-domestic' :
                    w.proposedUse === 'Geothermal' ? 'badge badge-geothermal' :
                    'badge badge-other'
                  }>
                    {w.proposedUse}
                  </span>
                </td>
                <td>{w.basinName}</td>
                <td style={{ color: '#94a3b8' }}>T{w.township} R{w.range} S{w.section}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', padding: '1rem', alignItems: 'center' }}>
          <button className="search-btn" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
            Prev
          </button>
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Page {page + 1} of {totalPages}
          </span>
          <button className="search-btn" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
            Next
          </button>
        </div>
      )}
    </div>
  )
}
