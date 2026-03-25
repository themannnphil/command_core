'use client'
import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Footer } from './Footer'

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 ml-56 flex flex-col min-h-screen overflow-auto">
        <main className="flex-1 p-6">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  )
}
