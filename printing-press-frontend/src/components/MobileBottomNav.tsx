import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getAccessibleModules } from '../utils/navigationConfig'
import type { SidebarModule } from '../utils/navigationConfig'
import { normalizeRoles } from '../utils/finishingRoles'

export default function MobileBottomNav() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    
    const [accessibleModules, setAccessibleModules] = useState<SidebarModule[]>([])
    const [pinnedModule, setPinnedModule] = useState<SidebarModule | null>(null)
    const [sheetOpen, setSheetOpen] = useState(false)
    const [updateKey, setUpdateKey] = useState(0)

    const userId = user?.id || user?._id

    // Fetch and sort accessible modules
    useEffect(() => {
        if (!user || !user.roles) return

        const roles = normalizeRoles(user.roles)
        const customOrderStr = localStorage.getItem(`sidebar-order-${userId}`)
        const customOrder = customOrderStr ? JSON.parse(customOrderStr) : undefined
        const modules = getAccessibleModules(roles, customOrder)
        setAccessibleModules(modules)

        // Find pinned module preference
        if (modules.length > 2) {
            const pinnedPath = localStorage.getItem(`mobile-pinned-module-${userId}`)
            const found = modules.find(m => m.path === pinnedPath) || modules[0]
            setPinnedModule(found || null)
        } else {
            setPinnedModule(null)
        }
    }, [user, userId, updateKey])

    // Listen for custom events to refresh live
    useEffect(() => {
        const handleUpdate = () => setUpdateKey(k => k + 1)
        window.addEventListener('sidebar-order-updated', handleUpdate)
        return () => window.removeEventListener('sidebar-order-updated', handleUpdate)
    }, [])

    if (!user || accessibleModules.length === 0) return null

    const handleNav = (path: string) => {
        if (path.includes('?')) {
            const [p, q] = path.split('?')
            navigate({ pathname: p, search: '?' + q })
        } else {
            navigate(path)
        }
        setSheetOpen(false)
    }

    const isTabActive = (m: SidebarModule) => {
        const [modulePath, moduleSearch] = m.path.split('?')
        const isPathMatch = location.pathname === modulePath || location.pathname.startsWith(modulePath + '/')
        const searchParams = new URLSearchParams(moduleSearch || '')
        const tabValue = searchParams.get('tab')
        const locationParams = new URLSearchParams(location.search)
        return isPathMatch && (!tabValue || locationParams.get('tab') === tabValue)
    }

    // Determine bottom bar tabs
    const showModulesSheetButton = accessibleModules.length > 2

    return (
        <>
            <nav className="mobile-bottom-nav">
                {/* 1. Directly show modules if <= 2, otherwise show the Pinned Module */}
                {!showModulesSheetButton ? (
                    accessibleModules.map(m => {
                        const active = isTabActive(m)
                        return (
                            <button
                                key={m.role}
                                onClick={() => handleNav(m.path)}
                                className={`mobile-bottom-nav-item ${active ? 'active' : ''}`}
                            >
                                <span className="icon">{m.icon}</span>
                                <span className="label">{m.label.replace(' Management', '').replace(' Control', '').replace(' Reports', '')}</span>
                            </button>
                        )
                    })
                ) : (
                    pinnedModule && (
                        <button
                            onClick={() => handleNav(pinnedModule.path)}
                            className={`mobile-bottom-nav-item ${isTabActive(pinnedModule) ? 'active' : ''}`}
                        >
                            <span className="icon">{pinnedModule.icon}</span>
                            <span className="label">{pinnedModule.label.replace(' Management', '').replace(' Control', '').replace(' Reports', '')}</span>
                        </button>
                    )
                )}

                {/* 2. Modules sheet toggle (Only for 3+ modules users) */}
                {showModulesSheetButton && (
                    <button
                        onClick={() => setSheetOpen(true)}
                        className={`mobile-bottom-nav-item ${sheetOpen ? 'active' : ''}`}
                    >
                        <span className="icon">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" />
                            </svg>
                        </span>
                        <span className="label">Modules</span>
                    </button>
                )}

                {/* 3. Settings / Profile tab (Always visible) */}
                <button
                    onClick={() => handleNav('/profile')}
                    className={`mobile-bottom-nav-item ${location.pathname === '/profile' ? 'active' : ''}`}
                >
                    <span className="icon">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    </span>
                    <span className="label">Profile</span>
                </button>
            </nav>

            {/* Bottom Sheet Modal */}
            {sheetOpen && (
                <>
                    <div className="bottom-sheet-backdrop" onClick={() => setSheetOpen(false)} />
                    <div className="bottom-sheet-container">
                        <div className="bottom-sheet-header">
                            <span className="bottom-sheet-title">Select Module</span>
                            <button className="bottom-sheet-close-btn" onClick={() => setSheetOpen(false)}>
                                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="bottom-sheet-grid">
                            {accessibleModules.map(m => {
                                const active = isTabActive(m)
                                return (
                                    <button
                                        key={m.role}
                                        onClick={() => handleNav(m.path)}
                                        className={`bottom-sheet-grid-item ${active ? 'active' : ''}`}
                                    >
                                        <span className="icon">{m.icon}</span>
                                        <span className="label">{m.label}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </>
            )}
        </>
    )
}
