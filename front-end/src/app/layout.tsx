'use client'
import './globals.css'
import { Providers } from './providers'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>LifeLink — Emergency Response Platform</title>
        <meta name="description" content="National Emergency Response & Dispatch Coordination" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%233b82f6'/><path d='M16 6v20M6 16h20' stroke='white' stroke-width='3.5' stroke-linecap='round'/></svg>" />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  )
}
