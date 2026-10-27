import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Inter, JetBrains_Mono } from 'next/font/google'

import { Providers } from './providers'
import './globals.css'

// Inter for the interface, JetBrains Mono for the generated list.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

const jetBrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Residential Proxy Generator',
  description:
    'Generate residential proxy lists with optional country, city and ASN targeting.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="bg-canvas text-ink min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
