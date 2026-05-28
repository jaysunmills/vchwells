import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
import type { Well } from './types'
import wellData from './data/wells.json'
import Dashboard from './Dashboard'

const WellMap = lazy(() => import('./WellMap'))
const WellTable = lazy(() => import('./WellTable'))
const DataAdmin = lazy(() => import('./DataAdmin'))
const Terms = lazy(() => import('./Terms'))

const wells = wellData as Well[]

type View = 'dashboard' | 'map' | 'table' | 'admin' | 'terms'

export type MapSearch = {
  type: 'address'
  center: [number, number]
  radius: number
} | {
  type: 'apn'
  apn: string
}

export default function App() {
  const initialView: View = typeof window !== 'undefined' && window.location.hash === '#admin' ? 'admin' : 'dashboard'
  const [view, setView] = useState<View>(initialView)
  const [pendingSearch, setPendingSearch] = useState<MapSearch | null>(null)

  useEffect(() => {
    function handleHash() {
      if (window.location.hash === '#admin') setView('admin')
    }
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  const handleDashboardSearch = useCallback((search: MapSearch) => {
    setPendingSearch({ ...search } as MapSearch)
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
          {view === 'admin' && (
            <button className="active" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fbbf24' }}>
              Admin
            </button>
          )}
        </nav>
      </header>
      <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>}>
        {view === 'dashboard' && <Dashboard wells={wells} onSearch={handleDashboardSearch} onShowTerms={() => setView('terms')} />}
        {view === 'map' && <WellMap wells={wells} initialSearch={pendingSearch} />}
        {view === 'table' && <WellTable wells={wells} />}
        {view === 'admin' && <DataAdmin wells={wells} />}
        {view === 'terms' && <Terms onBack={() => setView('dashboard')} />}
      </Suspense>
    </div>
  )
}
