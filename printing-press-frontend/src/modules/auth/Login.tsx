import { useState } from 'react'
import { api } from '../../services/api'
import { endpoints } from '../../services/endpoints'
import { useAuth } from '../../hooks/useAuth'
import { useNavigate } from 'react-router-dom'


export default function Login() {
  const [phone, setPhone] = useState('')
  const { login } = useAuth()

  const navigate = useNavigate()

  const submit = async () => {
    const res = await api.post(endpoints.login, { phone })
    login(res.data.token, res.data.user)

    const userRoles = res.data.user.roles || []

    if (userRoles.includes('ADMIN')) {
      navigate('/admin')
    } else if (userRoles.includes('PREPRESS')) {
      navigate('/prepress')
    } else if (userRoles.includes('CASHIER')) {
      navigate('/cashier')
    } else if (userRoles.includes('DISPATCH')) {
      navigate('/dispatch')
    } else {
      navigate('/')
    }
  }


  return (
    <div className="h-screen flex items-center justify-center">
      <div className="w-80 p-6 border rounded">
        <h2 className="text-xl mb-4">Login</h2>
        <input
          className="border p-2 w-full mb-4"
          placeholder="Phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <button
          type="button"
          className="bg-black text-white w-full p-2"
          onClick={submit}
        >
          Login
        </button>
      </div>
    </div>
  )
}

