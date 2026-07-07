import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { RoleGuard } from './role-guard'
import GlobalErrorPage from '../shared/components/GlobalErrorPage'
import { FINISHING_STATION_ROUTES, FINISHING_SUBROLES } from '../utils/finishingRoles'
import SidebarLayout from '../components/SidebarLayout'

// Lazy loaded modules
const Login = lazy(() => import('../pages/login'))
const ProfilePage = lazy(() => import('../pages/Profile'))
const Unauthorized = lazy(() => import('../pages/unauthorized'))
const CustomerDashboard = lazy(() => import('@modules/customer/frontend/customerDashboard'))
const CashierDashboard = lazy(() => import('@modules/cashier/frontend/CashierDashboard'))
const DispatchDashboard = lazy(() => import('@modules/despatch/frontend/DispatchDashboard'))
const PrepressDashboard = lazy(() => import('@modules/prepress/frontend/PrepressDashBoard'))
const QueueDashboard = lazy(() => import('@modules/prepress/frontend/QueueDashboard'))
const CreateJob = lazy(() => import('@modules/prepress/frontend/CreateJob'))
const AdminDashboard = lazy(() => import('@modules/admin/frontend/AdminDashboard'))
const AdminQueuePanel = lazy(() => import('@modules/admin/frontend/AdminQueuePanel'))
const WhatsAppJob = lazy(() => import('@modules/admin/frontend/WhatsAppJob'))
const CustomerPacking = lazy(() => import('@modules/customer/frontend/CustomerPacking'))
const CustomerUploadPage = lazy(() => import('../pages/CustomerUploadPage'))
const PressDashboard = lazy(() => import('@modules/press/frontend/PressDashboard'))
const PostPressDashboard = lazy(() => import('@modules/postpress/frontend/PostPressDashboard'))
const FinishingDashboard = lazy(() => import('@modules/finishing/frontend/FinishingDashboard'))

const LoadingFallback = () => (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
    </div>
)

const SuspenseWrapper = ({ children }: { children: React.ReactNode }) => (
    <Suspense fallback={<LoadingFallback />}>
        {children}
    </Suspense>
)

export const router = createBrowserRouter([
    {
        path: '/',
        errorElement: <GlobalErrorPage />,
        element: (
            <SuspenseWrapper>
                <Outlet />
            </SuspenseWrapper>
        ),
        children: [
            {
                index: true,
                element: <Navigate to="/login" />
            },
            {
                path: 'login',
                element: <Login />
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
            },
            {
                element: <SidebarLayout />,
                children: [
                    {
                        path: 'profile',
                        element: <ProfilePage />
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
                        path: 'press',
                        element: (
                            <RoleGuard allowed={['PRESS']}>
                                <PressDashboard />
                            </RoleGuard>
                        )
                    },
                    {
                        path: 'post-press',
                        element: (
                            <RoleGuard allowed={['POST_PRESS']}>
                                <PostPressDashboard />
                            </RoleGuard>
                        )
                    },
                    {
                        path: 'finishing',
                        element: (
                            <RoleGuard allowed={['FINISHING', 'FINISHING_CUTTING', 'FINISHING_DIE_CUTTING', 'FINISHING_CREASING', 'FINISHING_CORNER_CUT']}>
                                <FinishingDashboard />
                            </RoleGuard>
                        )
                    },
                    ...FINISHING_STATION_ROUTES.map(({ path }) => ({
                        path: `finishing/${path}`,
                        element: (
                            <RoleGuard allowed={['FINISHING', ...FINISHING_SUBROLES, 'ADMIN']}>
                                <FinishingDashboard />
                            </RoleGuard>
                        ),
                    }))
                ]
            }
        ]
    }
])
