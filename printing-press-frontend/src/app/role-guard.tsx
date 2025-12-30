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

    if (!allowed.includes(user.role)) {
        return <Navigate to="/" replace />
    }

    return <>{children}</>
}

