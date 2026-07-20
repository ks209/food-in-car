import  React from "react"
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
  title: "Carkhanaa Dashboard",
  description: "Restaurant management dashboard",
  icons: {
    icon: "/carkhanaalogo.png",
  },
}

export default function RootLayout({ children }
) {
  return (
    <html lang="en" suppressHydrationWarning className={`${workSans.variable} ${openSans.variable} antialiased`}>
      <head>
        {/* Set theme before paint to avoid a flash. Defaults to dark. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.classList.toggle('dark',t==='dark');}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body className="font-sans">
        <div>
        {children}
        <Toaster />
        </div>
      </body>
    </html>
  )
}
