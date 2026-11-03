import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Chat Studio',
  description: 'Chat with multiple LLMs side by side under one shared budget.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#0f1117] text-slate-100">{children}</body>
    </html>
  )
}
