import  React from "react"
import  { Metadata } from "next"
import { Work_Sans, Open_Sans } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"

const workSans = Work_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-work-sans",
  weight: ["400", "600", "700"],
})

const openSans = Open_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-open-sans",
  weight: ["400", "500"],
})

export const metadata = {
  title: "Restaurant Management Hub",
  description: "Professional admin dashboard for restaurant management",
  generator: "v0.app",
}

export default function RootLayout({ children }
) {
  return (
    <html lang="en" className={`${workSans.variable} ${openSans.variable} antialiased`}>
      <body className="font-sans">
        <div>
        {children}
        <Toaster />
        </div>
      </body>
    </html>
  )
}
