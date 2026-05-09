import { useState, useEffect } from 'react'
import { fetchProfile, updateProfile, changePassword } from '../services/api'
import { QRCodeSVG } from 'qrcode.react'
import './Profile.css'
import { useNavigate } from 'react-router-dom'

type ProfileData = {
    _id: string
    name: string
    phone: string
    roles: string[]
    type: 'STAFF' | 'CUSTOMER'
    joinedAt: string
}

export default function ProfilePage() {
    const [profile, setProfile] = useState<ProfileData | null>(null)
    const [loading, setLoading] = useState(true)
    const [isEditing, setIsEditing] = useState(false)
    const navigate = useNavigate()

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
                        {profile.roles.join(' / ')}
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
