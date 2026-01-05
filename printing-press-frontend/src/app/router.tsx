import { createBrowserRouter, Navigate } from 'react-router-dom'
import Login from '../pages/login'
import CustomerDashboard from '../modules/customer/customerDashboard'
import CashierDashboard from '../modules/cashier/CashierDashboard'
import { RoleGuard } from './role-guard'
import DispatchDashboard from '../modules/despatch/DispatchDashboard'
import PrepressDashboard from '../modules/prepress/PrepressDashBoard'
import CreateJob from '../modules/prepress/CreateJob'
import AdminDashboard from '../modules/admin/AdminDashboard'
import Unauthorized from '../pages/unauthorized'
import CustomerPacking from '../modules/customer/CustomerPacking'

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
    },
    {
        path: '/admin',
        element: (
            <RoleGuard allowed={['ADMIN']}>
                <AdminDashboard />
            </RoleGuard>
        )
    },
    {
        path: '/unauthorized',
        element: <Unauthorized />
    },
    {
        path: '/customer/:jobId',
        element: <CustomerPacking />
    },
    {
        path: '/customer/dashboard',
        element: <CustomerDashboard />
    }
])
