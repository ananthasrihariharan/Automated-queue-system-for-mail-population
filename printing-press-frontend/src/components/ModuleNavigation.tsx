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
                        className="px-4 py-1.5 text-xs font-extrabold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900 hover:shadow-sm transition-all uppercase tracking-wider text-gray-500 active:scale-95"
                    >
                        {m.label}
                    </button>
                )
            })}
        </div>
    )
}
