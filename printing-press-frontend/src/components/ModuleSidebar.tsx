import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getAccessibleModules } from '../utils/navigationConfig'
import { normalizeRoles } from '../utils/finishingRoles'

interface ModuleSidebarProps {
    isCollapsed: boolean
    onToggle: () => void
}

export default function ModuleSidebar({ isCollapsed, onToggle }: ModuleSidebarProps) {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()

    // ALL hooks must be declared before any early return (React Rules of Hooks)
    const [accessibleModules, setAccessibleModules] = useState<any[]>([])

    useEffect(() => {
        if (!user || !user.roles) return

        const roles = normalizeRoles(user.roles)

        const loadModules = () => {
            const customOrderStr = localStorage.getItem(`sidebar-order-${user.id}`)
            const customOrder = customOrderStr ? JSON.parse(customOrderStr) : undefined
            setAccessibleModules(getAccessibleModules(roles, customOrder))
        }

        loadModules()
        window.addEventListener('sidebar-order-updated', loadModules)
        return () => window.removeEventListener('sidebar-order-updated', loadModules)
    }, [user])

    // Early return AFTER all hooks
    if (!user || !user.roles) return null


    return (
        <aside className={`module-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
            {/* Sidebar Branding (Siva Prints) */}
            <div className="sidebar-brand-group">
                <div className="brand-logo-icon">SP</div>
                {!isCollapsed && <span className="brand-logo-text">Siva Prints</span>}
            </div>

            {/* Navigation Sections */}
            <div className="sidebar-nav-container">
                <div className="sidebar-nav-items">
                    {accessibleModules.map(m => {
                        // Split the path into pathname + search for comparison
                        const [modulePath, moduleSearch] = m.path.split('?')
                        const isPathMatch = location.pathname === modulePath || location.pathname.startsWith(modulePath + '/')
                        const searchParams = new URLSearchParams(moduleSearch || '')
                        const tabValue = searchParams.get('tab')
                        const locationParams = new URLSearchParams(location.search)
                        const isActive = isPathMatch && (
                            !tabValue || locationParams.get('tab') === tabValue
                        )

                        const handleNav = () => {
                            if (m.path.includes('?')) {
                                // For query-param paths, use navigate with search
                                const [p, q] = m.path.split('?')
                                navigate({ pathname: p, search: '?' + q })
                            } else {
                                navigate(m.path)
                            }
                        }

                        return (
                            <button
                                key={m.role}
                                onClick={handleNav}
                                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                                title={isCollapsed ? m.label : undefined}
                            >
                                <span className="icon">{m.icon}</span>
                                {!isCollapsed && <span className="label">{m.label}</span>}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Bottom Actions */}
            <div className="sidebar-bottom-actions">
                <button 
                    onClick={() => navigate('/profile')} 
                    className={`sidebar-nav-item bottom-item ${location.pathname === '/profile' ? 'active' : ''}`}
                    title={isCollapsed ? 'Profile Settings' : undefined}
                >
                    <span className="icon">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                    </span>
                    {!isCollapsed && <span className="label">Settings</span>}
                </button>
                <button 
                    onClick={logout} 
                    className="sidebar-nav-item bottom-item logout-btn-item"
                    title={isCollapsed ? 'Logout' : undefined}
                >
                    <span className="icon">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </span>
                    {!isCollapsed && <span className="label">Logout</span>}
                </button>

                {/* Sidebar Collapse Toggle */}
                <button onClick={onToggle} className="sidebar-toggle-btn" aria-label="Toggle Sidebar">
                    {isCollapsed ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                    ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                    )}
                </button>
            </div>
        </aside>
    )
}
