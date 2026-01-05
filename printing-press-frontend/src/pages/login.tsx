import { useState } from 'react'
import { api } from '../services/api'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import './Login.css'

export default function Login() {
    const [phone, setPhone] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const { login: authLogin } = useAuth()
    const navigate = useNavigate()

    const login = async () => {
        if (!phone || !password) {
            alert('Phone and password required')
            return
        }

        setLoading(true)
        try {
            const res = await api.post('/api/login', {
                phone,
                password
            })

            authLogin(res.data.token, res.data.user)

            const roles = res.data.user.roles

            if (roles.includes('ADMIN')) navigate('/admin')
            else if (roles.includes('PREPRESS')) navigate('/prepress')
            else if (roles.includes('CASHIER')) navigate('/cashier')
            else if (roles.includes('DISPATCH')) navigate('/dispatch')
            else if (roles.includes('CUSTOMER')) navigate('/customer/dashboard')
        } catch (err: any) {
            console.error('Login failed', err)
            alert(err.response?.data?.message || 'Login failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <header className="login-header">
                    <div className="login-logo">
                        <svg width="200" height="80" xmlns="http://www.w3.org/2000/svg">
                            <rect x="0" y="0" width="100" height="80" fill="black" />
                            <rect x="100" y="0" width="100" height="80" fill="orange" />
                            <text x="50" y="50" font-family="Arial" font-size="24" fill="white" text-anchor="middle">Siva</text>
                            <text x="150" y="50" font-family="Arial" font-size="24" fill="white" text-anchor="middle">Prints</text>
                        </svg>  
                    </div>
                    <span className="login-subtitle">Triplicane</span>
                </header>

                <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input
                        className="form-input"
                        placeholder="1234567890"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Password</label>
                    <input
                        type="password"
                        className="form-input"
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                    />
                </div>

                <button
                    type="button"
                    className="btn-login"
                    onClick={login}
                    disabled={loading}
                >
                    {loading ? 'Authenticating...' : 'Login'}
                </button>
            </div>
        </div>
    )
}
