import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getRoleBadgeLabel, normalizeRoles } from '../utils/finishingRoles'

export type CompactTab = 'active' | 'history' | 'incoming'

interface MobileTopBarCompactProps {
  title: string
  searchQuery: string
  onSearchChange: (v: string) => void
  dateFilter: string
  onDateChange: (v: string) => void
  activeTab: CompactTab
  onTabChange: (tab: CompactTab) => void
  showIncoming?: boolean
  incomingCount?: number
  gridColumns?: 1 | 2
  onGridColumnsChange?: (v: 1 | 2) => void
  onLayoutToggle?: () => void
  stationSwitcher?: React.ReactNode
}

export default function MobileTopBarCompact({
  title,
  searchQuery,
  onSearchChange,
  dateFilter,
  onDateChange,
  activeTab,
  onTabChange,
  showIncoming = false,
  incomingCount = 0,
  gridColumns,
  onGridColumnsChange,
  onLayoutToggle,
  stationSwitcher,
}: MobileTopBarCompactProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const roles = normalizeRoles(user?.roles || [])




  const initial = user?.name ? user.name.charAt(0).toUpperCase() : 'U'

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const tabs: { id: CompactTab; label: string; count?: number }[] = [
    ...(showIncoming ? [{ id: 'incoming' as CompactTab, label: 'Incoming', count: incomingCount > 0 ? incomingCount : undefined }] : []),
    { id: 'active', label: 'Active' },
    { id: 'history', label: 'History' },
  ]

  return (
    <div
      ref={menuRef}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: '#fff',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      }}
    >
      {/* ── Row 1: Title + Search + Toggles + Hamburger ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.55rem 0.75rem',
        background: '#fff',
      }}>
        {/* Title */}
        <span style={{
          fontWeight: 900,
          fontSize: '0.8rem',
          color: '#0f172a',
          textTransform: 'uppercase',
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          maxWidth: '26%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {title}
        </span>

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <svg
            style={{
              position: 'absolute', left: '0.55rem', top: '50%',
              transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none',
            }}
            width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            style={{
              width: '100%',
              height: '32px',
              paddingLeft: '1.8rem',
              paddingRight: '0.6rem',
              fontSize: '0.8125rem',
              background: '#f1f5f9',
              borderRadius: '999px',
              border: 'none',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            placeholder="Search..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
          />
        </div>

        {/* Layout toggle — tap to go back to list */}
        {onLayoutToggle && (
          <button
            onClick={onLayoutToggle}
            title="Switch to List Layout"
            aria-label="Switch to List Layout"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: '50%',
              background: '#0f172a', border: 'none',
              color: '#fff', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        )}

        {/* Column toggle */}
        {onGridColumnsChange && (
          <div style={{
            display: 'flex', alignItems: 'center', flexShrink: 0,
            background: '#f1f5f9', borderRadius: '999px', padding: '2px',
          }}>
            <button
              onClick={() => onGridColumnsChange(1)}
              aria-label="1 column"
              style={{
                width: 28, height: 28, borderRadius: '50%', border: 'none',
                fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                background: gridColumns === 1 ? '#0f172a' : 'transparent',
                color: gridColumns === 1 ? '#fff' : '#64748b',
                transition: 'all 0.15s ease',
              }}
            >1</button>
            <button
              onClick={() => onGridColumnsChange(2)}
              aria-label="2 columns"
              style={{
                width: 28, height: 28, borderRadius: '50%', border: 'none',
                fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                background: gridColumns === 2 ? '#0f172a' : 'transparent',
                color: gridColumns === 2 ? '#fff' : '#64748b',
                transition: 'all 0.15s ease',
              }}
            >2</button>
          </div>
        )}

        {/* Hamburger */}
        <button
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Menu"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: '50%',
            background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
            color: '#0f172a',
          }}
        >
          {menuOpen ? (
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Row 2: Pill tabs ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0 0.75rem 0.55rem',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              height: '30px',
              padding: '0 0.875rem',
              borderRadius: '999px',
              border: activeTab === tab.id ? 'none' : '1.5px solid #e2e8f0',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: activeTab === tab.id ? '#0f172a' : '#f8fafc',
              color: activeTab === tab.id ? '#fff' : '#64748b',
              transition: 'all 0.15s ease',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 16, height: 16, borderRadius: '50%',
                background: '#f59e0b', color: '#000',
                fontSize: '0.6rem', fontWeight: 900,
              }}>
                {tab.count > 9 ? '9+' : tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Dropdown menu ── */}
      {menuOpen && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '100%',
          background: '#fff', zIndex: 200,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          borderTop: '1px solid #f1f5f9',
        }}>
          {/* Date */}
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f8fafc' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>Date</div>
            <input
              type="date"
              style={{
                width: '100%', height: '36px', padding: '0 0.75rem',
                fontSize: '0.8125rem', background: '#f1f5f9',
                borderRadius: '10px', border: 'none', outline: 'none',
                boxSizing: 'border-box',
              }}
              value={dateFilter}
              onChange={e => onDateChange(e.target.value)}
            />
          </div>

          {/* Station switcher */}
          {stationSwitcher && (
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f8fafc' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>Station</div>
              {stationSwitcher}
            </div>
          )}

          {/* Profile */}
          <div style={{ padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: '#0f172a', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: '0.875rem', flexShrink: 0,
              }}>{initial}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>{user?.name}</div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{getRoleBadgeLabel(roles)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => { logout(); navigate('/login') }}
                style={{
                  flex: 1, height: 36, borderRadius: '10px', border: 'none',
                  background: '#fff1f2', color: '#e11d48',
                  fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                }}
              >
                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
