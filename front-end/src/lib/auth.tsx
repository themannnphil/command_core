'use client'
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { authApi, setToken, clearToken, User } from './api'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('ll_token')
    if (token) {
      setToken(token)
      authApi.profile()
        .then(setUser)
        .catch(() => { clearToken(); localStorage.removeItem('ll_token') })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password)
    setToken(res.accessToken)
    localStorage.setItem('ll_token', res.accessToken)
    localStorage.setItem('ll_refresh', res.refreshToken)
    setUser(res.user)
  }, [])

  const logout = useCallback(() => {
    clearToken()
    localStorage.removeItem('ll_token')
    localStorage.removeItem('ll_refresh')
    setUser(null)
    window.location.href = '/login'
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
