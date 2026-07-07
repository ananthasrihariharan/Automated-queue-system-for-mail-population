import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getFinishingLoginPath, normalizeRoles } from '../utils/finishingRoles'
import { ALL_SIDEBAR_MODULES } from '../utils/navigationConfig'

export default function AdminHeaderShortcuts() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()

    if (!user || !user.roles) return null

    const roles = normalizeRoles(user.roles)
    const isAdmin = roles.includes('ADMIN')

    // Only render for admins
    if (!isAdmin) return null

    const finishingPath = getFinishingLoginPath(roles)

    // Use the exact same modules + icons from navigationConfig (source of truth)
    // For admin shortcuts, show the operational modules (not the admin sub-tabs)
    const shortcutRoles = ['PREPRESS', 'PRESS', 'POST_PRESS', 'FINISHING', 'DISPATCH', 'CASHIER', 'QUEUE_CONTROL', 'ADMIN_JOBS']
    const shortcuts = ALL_SIDEBAR_MODULES
        .filter(m => shortcutRoles.includes(m.role))
        .map(m => ({
            ...m,
            // Override finishing path to use the correct sub-role path
            path: m.role === 'FINISHING' && finishingPath ? finishingPath : m.path,
            // For ADMIN_JOBS, use base /admin path
            label: m.role === 'ADMIN_JOBS' ? 'Admin' : m.label
        }))

    return (
        <div className="admin-header-shortcuts">
            {shortcuts.map(sc => {
                const [modulePath, moduleSearch] = sc.path.split('?')
                const isPathMatch = location.pathname === modulePath || location.pathname.startsWith(modulePath + '/')
                const searchParams = new URLSearchParams(moduleSearch || '')
                const tabValue = searchParams.get('tab')
                const locationParams = new URLSearchParams(location.search)
                const isActive = isPathMatch && (!tabValue || locationParams.get('tab') === tabValue)

                const handleNav = () => {
                    if (sc.path.includes('?')) {
                        const [p, q] = sc.path.split('?')
                        navigate({ pathname: p, search: '?' + q })
                    } else {
                        navigate(sc.path)
                    }
                }

                return (
                    <button
                        key={sc.role}
                        onClick={handleNav}
                        className={`admin-shortcut-btn ${isActive ? 'active' : ''}`}
                        title={sc.label}
                    >
                        {sc.icon}
                    </button>
                )
            })}
        </div>
    )
}
