import { createBrowserRouter, Navigate } from 'react-router-dom'
import Login from '../modules/auth/Login'
import CashierDashboard from '../modules/cashier/CashierDashboard'
import { RoleGuard } from './role-guard'

export const router = createBrowserRouter([
    {
        path: '/',
        element: <Navigate to="/login" />
    },
    {
        path: '/login',
        element: <Login />
    },
    {
        path: '/cashier',
        element: (
            <RoleGuard allowed={['CASHIER']}>
                <CashierDashboard />
            </RoleGuard>
        )
    }
])
