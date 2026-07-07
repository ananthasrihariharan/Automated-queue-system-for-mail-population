import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import ModuleSidebar from './ModuleSidebar'
import MobileBottomNav from './MobileBottomNav'

export default function SidebarLayout() {
    const [isCollapsed, setIsCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebar-collapsed')
        return saved === 'true'
    })
    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth <= 768)
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const handleToggle = () => {
        setIsCollapsed(prev => {
            const newVal = !prev
            localStorage.setItem('sidebar-collapsed', String(newVal))
            return newVal
        })
    }

    return (
        <div className="sidebar-layout-container" style={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
            {!isMobile && <ModuleSidebar isCollapsed={isCollapsed} onToggle={handleToggle} />}
            <main 
                className="sidebar-main-content" 
                style={{ 
                    flex: 1, 
                    minWidth: 0, 
                    marginLeft: isMobile ? '0px' : (isCollapsed ? '72px' : '240px'),
                    transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                <Outlet />
            </main>
            {isMobile && <MobileBottomNav />}
        </div>
    )
}
