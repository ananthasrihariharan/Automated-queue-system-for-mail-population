import React from 'react'
import { getFinishingLoginPath, getFinishingSubRoles, normalizeRoles } from './finishingRoles'

export interface SidebarModule {
    role: string
    path: string
    label: string
    category: string
    icon: React.ReactNode
}

export const ALL_SIDEBAR_MODULES: SidebarModule[] = [
    {
        role: 'QUEUE_CONTROL',
        path: '/admin/queue',
        label: 'Queue Control',
        category: 'General',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
    },
    {
        role: 'PREPRESS',
        path: '/prepress',
        label: 'Pre Press',
        category: 'General',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1 1V5zm7 0v14M4 12h14" /></svg>
    },
    {
        role: 'PRESS',
        path: '/press',
        label: 'Press',
        category: 'General',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
    },
    {
        role: 'POST_PRESS',
        path: '/post-press',
        label: 'Post Press',
        category: 'General',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
    },
    {
        role: 'FINISHING',
        path: '/finishing',
        label: 'Finishing',
        category: 'General',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg>
    },
    {
        role: 'DISPATCH',
        path: '/dispatch',
        label: 'Dispatch',
        category: 'General',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m10 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>
    },
    {
        role: 'ADMIN_JOBS',
        path: '/admin',
        label: 'Admin Jobs',
        category: 'Management',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
    },
    {
        role: 'ADMIN_TEAMS',
        path: '/admin?tab=employees',
        label: 'Teams',
        category: 'Management',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
    },
    {
        role: 'ADMIN_CUSTOMERS',
        path: '/admin?tab=customers',
        label: 'Customer Management',
        category: 'Management',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a3 3 0 100-6 3 3 0 000 6zm5-3h3m-3 2h3" /></svg>
    },
    {
        role: 'ADMIN_REPORTS',
        path: '/admin?tab=reports',
        label: 'Jobs Reports',
        category: 'Management',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
    },
    {
        role: 'CASHIER',
        path: '/cashier',
        label: 'Finance',
        category: 'Management',
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
    }
]

export function getAccessibleModules(userRoles: string[], customOrder?: string[]): SidebarModule[] {
    const roles = normalizeRoles(userRoles)
    const isAdmin = roles.includes('ADMIN')
    const finishingSubRoles = getFinishingSubRoles(roles)
    const finishingPath = getFinishingLoginPath(roles)

    // Filter modules that this user has access to
    const accessible = ALL_SIDEBAR_MODULES
        .map(m => {
            if (m.role === 'FINISHING' && finishingSubRoles.length > 0) {
                return { ...m, path: finishingPath }
            }
            return m
        })
        .filter(m => {
            // Customer portal is never shown in the staff/admin sidebar
            if (m.role === 'CUSTOMER') return false
            if (isAdmin) return true // Admins see all staff modules

            // Non-admin logic
            if (m.role.startsWith('ADMIN_') || m.role === 'QUEUE_CONTROL') {
                return false // Hide admin-only items
            }
            if (m.role === 'FINISHING' && (finishingSubRoles.length > 0 || roles.includes('FINISHING'))) {
                return true
            }
            return roles.includes(m.role)
        })

    // Sort by customOrder if provided, otherwise preserve default order
    if (customOrder && customOrder.length > 0) {
        return [...accessible].sort((a, b) => {
            // Compare paths (including tab params) to identify items uniquely
            const indexA = customOrder.indexOf(a.path)
            const indexB = customOrder.indexOf(b.path)

            if (indexA === -1 && indexB === -1) return 0
            if (indexA === -1) return 1 // Append new/un-ordered modules to the end
            if (indexB === -1) return -1
            return indexA - indexB
        })
    }

    return accessible
}
