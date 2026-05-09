import { createBrowserRouter, Navigate } from 'react-router-dom'
import Login from '../pages/login'
import CustomerDashboard from '../modules/customer/customerDashboard'
import CashierDashboard from '../modules/cashier/CashierDashboard'
import { RoleGuard } from './role-guard'
import DispatchDashboard from '../modules/despatch/DispatchDashboard'
import PrepressDashboard from '../modules/prepress/PrepressDashBoard'
import QueueDashboard from '../modules/prepress/QueueDashboard'
import CreateJob from '../modules/prepress/CreateJob'
import AdminDashboard from '../modules/admin/AdminDashboard'
import AdminQueuePanel from '../modules/admin/AdminQueuePanel'
import WhatsAppJob from '../modules/admin/WhatsAppJob'
import Unauthorized from '../pages/unauthorized'
import CustomerPacking from '../modules/customer/CustomerPacking'
import ProfilePage from '../pages/Profile'
import GlobalErrorPage from '../shared/components/GlobalErrorPage'
import CustomerUploadPage from '../pages/CustomerUploadPage'

export const router = createBrowserRouter([
    {
        path: '/',
        errorElement: <GlobalErrorPage />,
        children: [
            {
                index: true,
                element: <Navigate to="/login" />
            },
            {
                path: 'profile',
                element: <ProfilePage />
            },
            {
                path: 'login',
                element: <Login />
            },
            {
                path: 'cashier',
                element: (
                    <RoleGuard allowed={['CASHIER']}>
                        <CashierDashboard />
                    </RoleGuard>
                )
            },
            {
                path: 'dispatch',
                element: (
                    <RoleGuard allowed={['DISPATCH']}>
                        <DispatchDashboard />
                    </RoleGuard>
                )
            },
            {
                path: 'prepress',
                element: (
                    <RoleGuard allowed={['PREPRESS']}>
                        <PrepressDashboard />
                    </RoleGuard>
                )
            },
            {
                path: 'prepress/queue',
                element: (
                    <RoleGuard allowed={['PREPRESS']}>
                        <QueueDashboard />
                    </RoleGuard>
                )
            },
            {
                path: 'prepress/create',
                element: (
                    <RoleGuard allowed={['PREPRESS']}>
                        <CreateJob />
                    </RoleGuard>
                )
            },
            {
                path: 'prepress/edit/:id',
                element: (
                    <RoleGuard allowed={['PREPRESS']}>
                        <CreateJob />
                    </RoleGuard>
                )
            },
            {
                path: 'admin',
                element: (
                    <RoleGuard allowed={['ADMIN']}>
                        <AdminDashboard />
                    </RoleGuard>
                )
            },
            {
                path: 'admin/queue',
                element: (
                    <RoleGuard allowed={['ADMIN']}>
                        <AdminQueuePanel />
                    </RoleGuard>
                )
            },
            {
                path: 'admin/whatsapp-job',
                element: (
                    <RoleGuard allowed={['ADMIN']}>
                        <WhatsAppJob />
                    </RoleGuard>
                )
            },
            {
                path: 'unauthorized',
                element: <Unauthorized />
            },
            {
                path: 'customer/packing/:jobId',
                element: <CustomerPacking />
            },
            {
                path: 'customer/dashboard',
                element: <CustomerDashboard />
            },
            {
                path: 'upload/:staffId',
                element: <CustomerUploadPage />
            }
        ]
    }
])
