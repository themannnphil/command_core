'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { AuthProvider, useAuth } from '@/lib/auth'
import { ReactNode } from 'react'

function Guard({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !isAuthenticated && pathname !== '/login') {
      router.replace('/login')
    }
  }, [isAuthenticated, loading, pathname, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="text-sm text-text-muted font-medium">LifeLink</span>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Guard>{children}</Guard>
    </AuthProvider>
  )
}
