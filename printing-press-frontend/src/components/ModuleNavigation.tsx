import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function ModuleNavigation() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()

    if (!user || !user.roles) return null

    const roles = user.roles
    const isAdmin = roles.includes('ADMIN')

    // Define all possible modules
    const modules = [
        { role: 'PREPRESS', path: '/prepress', label: 'Prepress' },
        { role: 'CASHIER', path: '/cashier', label: 'Cashier' },
        { role: 'DISPATCH', path: '/dispatch', label: 'Dispatch' },
        { role: 'ADMIN', path: '/admin', label: 'Admin' },
    ]

    // Filter modules user has access to
    // If Admin, they access everything. Else, check role inclusion.
    const accessibleModules = modules.filter(m =>
        isAdmin || roles.includes(m.role)
    )

    if (accessibleModules.length <= 1) return null

    return (
        <div className="flex gap-2 items-center mr-4">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-2 hidden md:inline">Switch To:</span>
            {accessibleModules.map(m => {
                const isActive = location.pathname.startsWith(m.path)
                if (isActive) return null // Don't show current module link

                return (
                    <button
                        key={m.role}
                        onClick={() => navigate(m.path)}
                        className="px-3 py-1 text-xs font-bold bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors uppercase tracking-wide text-slate-600"
                    >
                        {m.label}
                    </button>
                )
            })}
        </div>
    )
}
