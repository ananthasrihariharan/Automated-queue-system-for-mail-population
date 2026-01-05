import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

type RoleGuardProps = {
    allowed: string[]
    children: React.ReactNode
}

export const RoleGuard = ({ allowed, children }: RoleGuardProps) => {
    const { user } = useAuth()

    if (!user) {
        return <Navigate to="/login" replace />
    }

    const userRoles = user.roles || []

    // Admin override
    if (userRoles.includes('ADMIN')) {
        return <>{children}</>
    }

    if (!allowed.some(role => userRoles.includes(role))) {
        return <Navigate to="/unauthorized" replace />
    }


    return <>{children}</>
}

