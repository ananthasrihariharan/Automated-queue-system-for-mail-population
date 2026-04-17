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
    // Define all possible modules with icons
    const modules = [
        {
            role: 'PREPRESS',
            path: '/prepress',
            label: 'Prepress',
            icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        },
        {
            role: 'CASHIER',
            path: '/cashier',
            label: 'Cashier',
            icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        },
        {
            role: 'DISPATCH',
            path: '/dispatch',
            label: 'Dispatch',
            icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        },
        {
            role: 'ADMIN',
            path: '/admin',
            label: 'Admin',
            icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        },
    ]

    // Filter modules user has access to
    // If Admin, they access everything. Else, check role inclusion.
    const accessibleModules = modules.filter(m =>
        isAdmin || roles.includes(m.role)
    )

    if (accessibleModules.length <= 1) return null

    return (
        <div className="nav-segmented-pill">
            {accessibleModules.map(m => {
                const isActive = location.pathname.startsWith(m.path)
                return (
                    <button
                        key={m.role}
                        onClick={() => navigate(m.path)}
                        className={`nav-item-luxury ${isActive ? 'active' : ''}`}
                    >
                        <span className="icon">{m.icon}</span>
                        <span className="label">{m.label}</span>
                    </button>
                )
            })}
            <div className="nav-glider" />
        </div>
    )
}
