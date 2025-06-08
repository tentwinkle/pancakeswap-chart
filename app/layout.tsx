import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'pancakeswap-candlestick',
  description: 'PancakeSwap Candlestick App',
  generator: 'Lukas',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
