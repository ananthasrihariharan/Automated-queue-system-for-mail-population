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
        <div className="user-menu-container" ref={menuRef}>
            <button className="user-menu-btn" onClick={() => setIsOpen(!isOpen)}>
                <div className="user-avatar-small">{initial}</div>
                <div className="user-menu-details">
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>{user.name.split(' ')[0]}</span>
                    <span style={{ fontSize: '0.625rem', color: '#6b7280' }}>
                        {user.roles && user.roles[0] === 'CUSTOMER' ? 'Customer' : 'Staff'}
                    </span>
                </div>
                <svg className="user-menu-chevron" width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="user-dropdown">
                    <div
                        className="dropdown-item"
                        onClick={() => { setIsOpen(false); navigate('/profile'); }}
                    >
                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        My Profile
                    </div>
                    <div style={{ height: '1px', background: '#f3f4f6', margin: '0.25rem 0' }}></div>
                    <div
                        className="dropdown-item danger"
                        onClick={() => { setIsOpen(false); logout(); navigate('/login'); }}
                    >
                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        Logout
                    </div>
                </div>
            )}
        </div>
    )
}
