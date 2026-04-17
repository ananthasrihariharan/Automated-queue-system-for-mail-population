import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import '../pages/Profile.css' // Reuse profile CSS

export default function UserMenu() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const [isOpen, setIsOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    if (!user) return null

    const initial = user.name ? user.name.charAt(0).toUpperCase() : 'U'

    return (
        <div className="user-menu-elite" ref={menuRef}>
            <button className="user-trigger-pill" onClick={() => setIsOpen(!isOpen)}>
                <div className="user-avatar-mini">{initial}</div>
                <div className="user-details-mini">
                    <span className="user-name">{user.name.split(' ')[0]}</span>
                    <svg className={`chevron ${isOpen ? 'open' : ''}`} viewBox="0 0 24 24" width="16" height="16">
                        <path fill="currentColor" d="M7 10l5 5 5-5H7z"/>
                    </svg>
                </div>
            </button>

            {isOpen && (
                <div className="user-dropdown-luxury">
                    <div className="dropdown-info">
                        <strong>{user.name}</strong>
                        <span>{user.roles && user.roles[0] === 'CUSTOMER' ? 'Customer' : 'Staff Member'}</span>
                    </div>
                    <div style={{ height: '1px', background: '#f1f5f9', margin: '0.5rem 0' }} />
                    <button
                        className="dropdown-item"
                        onClick={() => { setIsOpen(false); navigate('/profile'); }}
                    >
                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="mr-2 inline"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        My Profile
                    </button>
                    <button
                        className="dropdown-item logout"
                        onClick={() => { setIsOpen(false); logout(); navigate('/login'); }}
                    >
                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="mr-2 inline"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        Logout
                    </button>
                </div>
            )}
        </div>
    )
}
