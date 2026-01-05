import { useState } from 'react'
import { api } from '../services/api'
import { useNavigate } from 'react-router-dom'

export default function CustomerLogin() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  const login = async () => {
    try {
      const res = await api.post(
        '/api/customer-auth/login',
        { phone, password }
      )

      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.customer))
      navigate('/customer/dashboard')
    } catch (err: any) {
      alert(err.response?.data?.message || 'Login failed')
    }
  }

  return (
    <div className="h-screen flex items-center justify-center">
      <div className="border p-6 w-80">
        <h1 className="text-xl font-bold mb-4">Customer Login</h1>

        <input
          className="border p-2 w-full mb-3"
          placeholder="Phone"
          value={phone}
          onChange={e => setPhone(e.target.value)}
        />

        <input
          type="password"
          className="border p-2 w-full mb-4"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        <button
          className="bg-black text-white w-full py-2"
          onClick={login}
        >
          View My Jobs
        </button>
      </div>
    </div>
  )
}
