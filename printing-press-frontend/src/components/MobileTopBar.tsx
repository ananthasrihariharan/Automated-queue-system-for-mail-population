import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getRoleBadgeLabel, normalizeRoles } from '../utils/finishingRoles'

interface MobileTopBarProps {
  title: string
  searchQuery: string
  onSearchChange: (v: string) => void
  dateFilter: string
  onDateChange: (v: string) => void
  viewMode: 'active' | 'history'
  onViewModeChange: (v: 'active' | 'history') => void
  mainView?: 'incoming' | 'active'
  onMainViewChange?: (v: 'incoming' | 'active') => void
  stationSwitcher?: React.ReactNode
  layoutMode?: 'default' | 'grid'
  onLayoutModeChange?: (v: 'default' | 'grid') => void
  gridColumns?: 1 | 2
  onGridColumnsChange?: (v: 1 | 2) => void
}

export default function MobileTopBar({
  title,
  searchQuery,
  onSearchChange,
  dateFilter,
  onDateChange,
  viewMode,
  onViewModeChange,
  mainView,
  onMainViewChange,
  stationSwitcher,
  layoutMode,
  onLayoutModeChange,
  gridColumns,
  onGridColumnsChange,
}: MobileTopBarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const roles = normalizeRoles(user?.roles || [])




  const initial = user?.name ? user.name.charAt(0).toUpperCase() : 'U'

  return (
    <div className="mobile-topbar" ref={menuRef}>
      {/* Top row: title + search + hamburger */}
      <div className="mobile-topbar-row">
        <span className="mobile-topbar-title">{title}</span>

        {/* Search bar */}
        <div className="mobile-topbar-search">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            className="mobile-topbar-search-input"
            placeholder="Search..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            onMouseDown={e => e.stopPropagation()}
          />
        </div>

        {/* Layout toggle — always visible when prop is provided */}
        {onLayoutModeChange && (
          <button
            onClick={() => onLayoutModeChange(layoutMode === 'default' ? 'grid' : 'default')}
            title={layoutMode === 'grid' ? 'Switch to List' : 'Switch to Grid'}
            aria-label={layoutMode === 'grid' ? 'List Layout' : 'Grid Layout'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 36,
              minHeight: 36,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#0f172a',
              padding: 0,
              flexShrink: 0,
            }}
          >
            {layoutMode === 'grid' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
              </svg>
            )}
          </button>
        )}

        {/* Column count toggle — only in grid mode */}
        {layoutMode === 'grid' && onGridColumnsChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <button
              onClick={() => onGridColumnsChange(1)}
              aria-label="1 column"
              style={{
                minHeight: 28,
                minWidth: 26,
                fontSize: '0.75rem',
                fontWeight: 700,
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                padding: '0 6px',
                background: gridColumns === 1 ? '#3730a3' : 'transparent',
                color: gridColumns === 1 ? '#fff' : '#64748b',
              }}
            >1</button>
            <button
              onClick={() => onGridColumnsChange(2)}
              aria-label="2 columns"
              style={{
                minHeight: 28,
                minWidth: 26,
                fontSize: '0.75rem',
                fontWeight: 700,
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                padding: '0 6px',
                background: gridColumns === 2 ? '#3730a3' : 'transparent',
                color: gridColumns === 2 ? '#fff' : '#64748b',
              }}
            >2</button>
          </div>
        )}

        {/* Hamburger */}
        <button
          className="mobile-topbar-hamburger"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Menu"
        >
          {menuOpen ? (
            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Dropdown menu */}
      {menuOpen && (
        <div className="mobile-topbar-menu">
          {/* Date filter */}
          <div className="mobile-menu-section">
            <label className="mobile-menu-label">Date</label>
            <input
              type="date"
              className="mobile-menu-date"
              value={dateFilter}
              onChange={e => onDateChange(e.target.value)}
            />
          </div>

          {/* Station switcher (e.g. finishing sub-roles) */}
          {stationSwitcher && (
            <div className="mobile-menu-section">
              <label className="mobile-menu-label">Station</label>
              {stationSwitcher}
            </div>
          )}

          {/* View tabs: Incoming / Active / History */}
          <div className="mobile-menu-section">
            <label className="mobile-menu-label">View</label>
            <div className="mobile-menu-tabs">
              {mainView !== undefined && onMainViewChange && (
                <>
                  {/* Incoming Button */}
                  <button
                    className={`mobile-menu-tab ${mainView === 'incoming' ? 'active' : ''}`}
                    onClick={() => { onMainViewChange('incoming'); setMenuOpen(false) }}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16l-4-4m0 0l4-4m-4 4h18" /></svg>
                    Incoming
                  </button>
                  {/* Active Button - always visible */}
                  <button
                    className={`mobile-menu-tab ${mainView === 'active' && viewMode === 'active' ? 'active' : ''}`}
                    onClick={() => { onMainViewChange('active'); onViewModeChange('active'); setMenuOpen(false) }}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    Active
                  </button>
                  {/* History Button - always visible */}
                  <button
                    className={`mobile-menu-tab ${mainView === 'active' && viewMode === 'history' ? 'active' : ''}`}
                    onClick={() => { onMainViewChange('active'); onViewModeChange('history'); setMenuOpen(false) }}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    History
                  </button>
                </>
              )}
              {mainView === undefined && (
                <>
                  <button
                    className={`mobile-menu-tab ${viewMode === 'active' ? 'active' : ''}`}
                    onClick={() => { onViewModeChange('active'); setMenuOpen(false) }}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    Active
                  </button>
                  <button
                    className={`mobile-menu-tab ${viewMode === 'history' ? 'active' : ''}`}
                    onClick={() => { onViewModeChange('history'); setMenuOpen(false) }}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    History
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Profile & Logout */}
          <div className="mobile-menu-section mobile-menu-profile">
            <div className="mobile-menu-user">
              <div className="mobile-menu-avatar">{initial}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>{user?.name}</div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{getRoleBadgeLabel(roles)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button
                className="mobile-menu-action-btn logout"
                onClick={() => { logout(); navigate('/login') }}
                style={{ width: '100%' }}
              >
                <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
