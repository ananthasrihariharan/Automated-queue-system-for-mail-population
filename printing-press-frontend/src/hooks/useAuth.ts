import { useState } from 'react'

export function useAuth() {
  const [user, setUser] = useState(
    JSON.parse(sessionStorage.getItem('user') || 'null')
  )

  const login = (token: string, userData: any) => {
    sessionStorage.setItem('token', token)
    sessionStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
  }

  const logout = () => {
    sessionStorage.clear()
    setUser(null)
  }

  return { user, login, logout }
}
