import { useState, useEffect } from 'react'
import { fetchProfile, updateProfile, changePassword } from '../services/api'
import { QRCodeSVG } from 'qrcode.react'
import './Profile.css'
import { useNavigate } from 'react-router-dom'
import { getAccessibleModules } from '../utils/navigationConfig'
import { normalizeRoles } from '../utils/finishingRoles'
import { useAuth } from '../hooks/useAuth'

type ProfileData = {
    _id: string
    name: string
    phone: string
    roles: string[]
    type: 'STAFF' | 'CUSTOMER'
    joinedAt: string
}

export default function ProfilePage() {
    const { user: authUser } = useAuth()
    const [profile, setProfile] = useState<ProfileData | null>(null)
    const [loading, setLoading] = useState(true)
    const [isEditing, setIsEditing] = useState(false)
    const navigate = useNavigate()

    // Use the same user ID as ModuleSidebar — from auth session, not profile response
    const userId = authUser?.id || authUser?._id

    const [orderedModules, setOrderedModules] = useState<any[]>([])
    const [pinnedModulePath, setPinnedModulePath] = useState<string>('')
    const dragIndex = { current: -1 }
    const [savedOrder, setSavedOrder] = useState(false)

    useEffect(() => {
        if (profile) {
            const roles = normalizeRoles(profile.roles || [])
            const customOrderStr = localStorage.getItem(`sidebar-order-${userId}`)
            const customOrder = customOrderStr ? JSON.parse(customOrderStr) : undefined
            const modules = getAccessibleModules(roles, customOrder)
            setOrderedModules(modules)

            const savedPinned = localStorage.getItem(`mobile-pinned-module-${userId}`)
            setPinnedModulePath(savedPinned || (modules[0]?.path || ''))
        }
    }, [profile])

    const saveOrder = (newList: any[], showFlash = false) => {
        setOrderedModules(newList)
        const pathsOrder = newList.map(m => m.path)
        localStorage.setItem(`sidebar-order-${userId}`, JSON.stringify(pathsOrder))
        window.dispatchEvent(new Event('sidebar-order-updated'))
        if (showFlash) {
            setSavedOrder(true)
            setTimeout(() => setSavedOrder(false), 2000)
        }
    }

    const handleSaveOrderClick = () => {
        saveOrder(orderedModules, true)
    }

    const handleResetOrder = () => {
        if (!profile) return
        localStorage.removeItem(`sidebar-order-${userId}`)
        localStorage.removeItem(`mobile-pinned-module-${userId}`)
        const roles = normalizeRoles(profile.roles || [])
        const defaultModules = getAccessibleModules(roles, undefined)
        saveOrder(defaultModules, true)
        setPinnedModulePath(defaultModules[0]?.path || '')
    }

    const handlePinModuleChange = (path: string) => {
        setPinnedModulePath(path)
        localStorage.setItem(`mobile-pinned-module-${userId}`, path)
        window.dispatchEvent(new Event('sidebar-order-updated'))
    }

    const moveItem = (index: number, direction: number) => {
        const nextIdx = index + direction
        if (nextIdx < 0 || nextIdx >= orderedModules.length) return
        const newList = [...orderedModules]
        const temp = newList[index]
        newList[index] = newList[nextIdx]
        newList[nextIdx] = temp
        saveOrder(newList)
    }

    const handleDragStart = (index: number) => {
        dragIndex.current = index
    }

    const handleDrop = (dropIndex: number) => {
        const from = dragIndex.current
        if (from === dropIndex || from === -1) return
        const newList = [...orderedModules]
        const [moved] = newList.splice(from, 1)
        newList.splice(dropIndex, 0, moved)
        dragIndex.current = -1
        saveOrder(newList)
    }

    // Form States
    const [formData, setFormData] = useState({ name: '', phone: '' })
    const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '' })
    const [message, setMessage] = useState('')

    useEffect(() => {
        loadProfile()
    }, [])

    const loadProfile = async () => {
        try {
            const data = await fetchProfile()
            setProfile(data)
            setFormData({ name: data.name, phone: data.phone })
        } catch (err: any) {
            console.error(err)
            if (err.response?.status === 401) navigate('/login')
        } finally {
            setLoading(false)
        }
    }

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault()
        setMessage('')

        try {
            // Update Profile Info
            const updated = await updateProfile(formData)
            setProfile(updated.user)

            // Update Password if provided
            if (passwordData.currentPassword && passwordData.newPassword) {
                await changePassword(passwordData)
                setPasswordData({ currentPassword: '', newPassword: '' })
            }

            setIsEditing(false)
            setMessage('Profile updated successfully!')
            setTimeout(() => setMessage(''), 3000)
        } catch (err: any) {
            console.error(err)
            const errorMsg = err.response?.data?.message || 'Update failed'
            alert(errorMsg)
        }
    }



    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Profile...</div>
    if (!profile) return null

    const initial = profile.name.charAt(0).toUpperCase()

    return (
        <div className="profile-page">
            <header className="profile-header">
                <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    Back
                </button>
                <h1 style={{ fontSize: '2rem', fontWeight: 900 }}>My Profile</h1>
            </header>

            {message && (
                <div style={{ marginBottom: '1rem', padding: '1rem', background: '#d1fae5', color: '#065f46', borderRadius: '8px', fontWeight: 600 }}>
                    {message}
                </div>
            )}

            <div className="profile-layout">
                {/* Sidebar */}
                <div className="profile-sidebar">
                    <div className="profile-avatar">{initial}</div>
                    <h2 className="profile-name">{profile.name}</h2>

                    <div className="profile-role-badge">
                        {(profile.roles || []).join(' / ')}
                    </div>
                    {!isEditing && (
                        <button className="profile-edit-btn" onClick={() => setIsEditing(true)}>
                            Edit Profile
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="profile-content">
                    {/* Basic Info Card */}
                    <div className="profile-card">
                        <div className="card-title">
                            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            Personal Information
                        </div>

                        {isEditing ? (
                            <form onSubmit={handleUpdateProfile}>
                                <div className="form-group">
                                    <label>Name</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Phone</label>
                                    <input
                                        type="text"
                                        value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        required
                                    />
                                </div>

                                <div style={{ margin: '1.5rem 0', borderTop: '1px solid #e5e7eb' }}></div>
                                <div className="card-title" style={{ fontSize: '1rem', marginBottom: '1rem' }}>
                                    Change Password <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#6b7280' }}>(Optional)</span>
                                </div>

                                <div className="form-group">
                                    <label>Current Password</label>
                                    <input
                                        type="password"
                                        value={passwordData.currentPassword}
                                        onChange={e => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                                        placeholder="••••••••"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>New Password</label>
                                    <input
                                        type="password"
                                        value={passwordData.newPassword}
                                        onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                        placeholder="Min 6 chars"
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                                    <button type="button" className="profile-edit-btn" onClick={() => { setIsEditing(false); setFormData({ name: profile.name, phone: profile.phone }); setPasswordData({ currentPassword: '', newPassword: '' }); }}>Cancel</button>
                                    <button type="submit" className="save-btn">Save Changes</button>
                                </div>
                            </form>
                        ) : (
                            <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: '1fr 1fr' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Phone Number</label>
                                    <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>{profile.phone}</div>
                                </div>

                            </div>
                        )}
                    </div>

                    {/* Sidebar Reordering Card */}
                    <div className="profile-card no-print" style={{ marginTop: '2rem' }}>
                        <div className="card-title">
                            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" /></svg>
                            Sidebar Menu Customization
                        </div>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.25rem' }}>
                            Adjust the order of navigation links in your left sidebar. Changes are applied instantly.
                        </p>

                        <div className="reorder-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {orderedModules.map((m, idx) => (
                                <div
                                    key={m.role}
                                    draggable
                                    onDragStart={() => handleDragStart(idx)}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={() => handleDrop(idx)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.65rem 0.75rem',
                                        background: '#f8fafc',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        cursor: 'grab',
                                        transition: 'background 0.15s, box-shadow 0.15s',
                                        userSelect: 'none'
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                                    onMouseLeave={e => (e.currentTarget.style.background = '#f8fafc')}
                                >
                                    {/* Drag handle grip icon */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                        <span style={{ color: '#94a3b8', display: 'flex', cursor: 'grab', paddingRight: '0.15rem' }}>
                                            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                                                <circle cx="9" cy="6" r="2"/><circle cx="15" cy="6" r="2"/>
                                                <circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/>
                                                <circle cx="9" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>
                                            </svg>
                                        </span>
                                        <span style={{ color: '#64748b', fontSize: '0.875rem', display: 'flex', alignItems: 'center' }}>{m.icon}</span>
                                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>{m.label}</span>
                                    </div>
                                    {/* Up/Down buttons as keyboard fallback */}
                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                        <button
                                            type="button"
                                            disabled={idx === 0}
                                            onClick={() => moveItem(idx, -1)}
                                            style={{
                                                padding: '0.2rem 0.45rem',
                                                fontSize: '0.7rem',
                                                borderRadius: '4px',
                                                border: '1px solid #cbd5e1',
                                                background: '#fff',
                                                cursor: idx === 0 ? 'not-allowed' : 'pointer',
                                                opacity: idx === 0 ? 0.35 : 0.8,
                                                lineHeight: 1
                                            }}
                                            title="Move Up"
                                        >▲</button>
                                        <button
                                            type="button"
                                            disabled={idx === orderedModules.length - 1}
                                            onClick={() => moveItem(idx, 1)}
                                            style={{
                                                padding: '0.2rem 0.45rem',
                                                fontSize: '0.7rem',
                                                borderRadius: '4px',
                                                border: '1px solid #cbd5e1',
                                                background: '#fff',
                                                cursor: idx === orderedModules.length - 1 ? 'not-allowed' : 'pointer',
                                                opacity: idx === orderedModules.length - 1 ? 0.35 : 0.8,
                                                lineHeight: 1
                                            }}
                                            title="Move Down"
                                        >▼</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Mobile pinned module dropdown (only shown if user has 3+ modules) */}
                        {orderedModules.length > 2 && (
                            <div style={{ marginTop: '1.25rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                                    Mobile Pinned Module
                                </label>
                                <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem' }}>
                                    Choose one module to display directly on your mobile bottom navigation bar.
                                </p>
                                <select
                                    value={pinnedModulePath}
                                    onChange={e => handlePinModuleChange(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem 0.75rem',
                                        fontSize: '0.85rem',
                                        borderRadius: '6px',
                                        border: '1px solid #cbd5e1',
                                        background: '#fff',
                                        color: '#0f172a',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {orderedModules.map(m => (
                                        <option key={m.role} value={m.path}>
                                            {m.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Save / Reset buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={handleResetOrder}
                                style={{
                                    padding: '0.5rem 1.1rem',
                                    fontSize: '0.82rem',
                                    fontWeight: 600,
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    background: '#f8fafc',
                                    color: '#475569',
                                    cursor: 'pointer'
                                }}
                            >
                                Reset to Default
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveOrderClick}
                                style={{
                                    padding: '0.5rem 1.4rem',
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: savedOrder ? '#22c55e' : '#2563eb',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    transition: 'background 0.3s ease'
                                }}
                            >
                                {savedOrder ? (
                                    <>
                                        <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                                        Saved!
                                    </>
                                ) : (
                                    'Save Order'
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Walk-in QR Code Card (Only for Staff) */}
                    {profile.type === 'STAFF' && (
                        <div className="profile-card qr-card no-print">
                            <div className="card-title">
                                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                                My Walk-in Portal QR
                            </div>
                            
                            <div className="qr-container">
                                <div className="qr-box" id="printable-qr">
                                    <div className="qr-header">
                                        <div className="qr-brand">PRINTING PRESS</div>
                                        <div className="qr-staff-name">Scan to send files to {profile.name}</div>
                                    </div>
                                    
                                    <div className="qr-code-wrapper">
                                        <QRCodeSVG 
                                            value={`${import.meta.env.VITE_WALKIN_PORTAL_URL || 'http://localhost:5001'}/${profile._id}`}
                                            size={180}
                                            level="H"
                                            includeMargin={true}
                                        />
                                    </div>
                                    
                                    <div className="qr-footer">
                                        POWERED BY DESPATCH SYSTEM
                                    </div>
                                </div>

                                <div className="qr-actions">
                                    <p className="qr-help-text">
                                        Print this QR code and keep it at your desk. Customers can scan it to upload files directly to your queue.
                                    </p>
                                    <button className="profile-edit-btn" onClick={() => window.print()}>
                                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="mr-2"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                        Print QR Code
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
