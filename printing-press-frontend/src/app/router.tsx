import { createBrowserRouter, Navigate } from 'react-router-dom'
import Login from '../modules/auth/Login'
import CashierDashboard from '../modules/cashier/CashierDashboard'
import { RoleGuard } from './role-guard'
import DispatchDashboard from '../modules/despatch/DispatchDashboard'
import PrepressDashboard from '../modules/prepress/prepressDashBoard'
import CreateJob from '../modules/prepress/CreateJob'

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
    },
    {
        path: '/dispatch',
        element: (
            <RoleGuard allowed={['DISPATCH']}>
                <DispatchDashboard />
            </RoleGuard>
        )
    },
    {
        path: '/prepress',
        element: (
            <RoleGuard allowed={['PREPRESS']}>
                <PrepressDashboard />
            </RoleGuard>
        )
    },
    {
        path: '/prepress/create',
        element: (
            <RoleGuard allowed={['PREPRESS']}>
                <CreateJob />
            </RoleGuard>
        )
    }   
])
