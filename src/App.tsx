import { useState, useCallback, lazy, Suspense } from 'react'
import type { Well } from './types'
import wellData from './data/wells.json'
import Dashboard from './Dashboard'

const WellMap = lazy(() => import('./WellMap'))
const WellTable = lazy(() => import('./WellTable'))

const wells = wellData as Well[]

type View = 'dashboard' | 'map' | 'table'

export interface MapSearch {
  center: [number, number]
  radius: number
}

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [pendingSearch, setPendingSearch] = useState<MapSearch | null>(null)

  const handleDashboardSearch = useCallback((center: [number, number], radius: number) => {
    setPendingSearch({ center, radius })
    setView('map')
  }, [])

  return (
    <div className="app">
      <header className="header">
        <h1><span>vch</span>wells.com</h1>
        <nav className="nav">
          <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>
            Dashboard
          </button>
          <button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>
            Map
          </button>
          <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>
            Data
          </button>
        </nav>
      </header>
      <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>}>
        {view === 'dashboard' && <Dashboard wells={wells} onSearch={handleDashboardSearch} />}
        {view === 'map' && <WellMap wells={wells} initialSearch={pendingSearch} />}
        {view === 'table' && <WellTable wells={wells} />}
      </Suspense>
    </div>
  )
}
