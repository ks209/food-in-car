"use client"

import { useRef } from "react"
import { QRCodeCanvas } from "qrcode.react"
import jsPDF from "jspdf"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { QrCode, Download, FileText } from "lucide-react"
import { useRestaurant } from "@/lib/restaurant-context"

export function QrDownloadCard() {
  const restaurant = useRestaurant()
  const qrWrapRef = useRef(null)

  if (!restaurant?.orderingUrl) return null

  const slug = (restaurant.name || restaurant.username || "restaurant").toLowerCase().replace(/[^a-z0-9]+/g, "-")

  // Draws the restaurant's name + the QR onto an offscreen canvas so the
  // downloaded file carries branding, not just a bare QR code.
  const buildBrandedPng = () => {
    const qrCanvas = qrWrapRef.current?.querySelector("canvas")
    if (!qrCanvas) return null

    const width = 480
    const qrSize = 320
    const padding = 40
    const nameBlock = 56
    const gap = 16
    const captionBlock = 28
    const height = padding + nameBlock + gap + qrSize + gap + captionBlock + padding

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")

    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, width, height)

    let y = padding
    ctx.fillStyle = "#0f172a"
    ctx.font = "700 26px sans-serif"
    ctx.textAlign = "center"
    ctx.fillText(restaurant.name || restaurant.username || "Order Online", width / 2, y + 26)
    y += nameBlock + gap

    ctx.drawImage(qrCanvas, (width - qrSize) / 2, y, qrSize, qrSize)
    y += qrSize + gap

    ctx.fillStyle = "#475569"
    ctx.font = "500 16px sans-serif"
    ctx.fillText("Scan to order", width / 2, y + 16)

    return canvas.toDataURL("image/png")
  }

  const downloadPng = () => {
    const dataUrl = buildBrandedPng()
    if (!dataUrl) return
    const a = document.createElement("a")
    a.href = dataUrl
    a.download = `${slug}-order-qr.png`
    a.click()
  }

  const downloadPdf = () => {
    const dataUrl = buildBrandedPng()
    if (!dataUrl) return
    const img = new Image()
    img.onload = () => {
      const doc = new jsPDF({ unit: "pt", format: [img.width, img.height] })
      doc.addImage(dataUrl, "PNG", 0, 0, img.width, img.height)
      doc.save(`${slug}-order-qr.pdf`)
    }
    img.src = dataUrl
  }

  return (
    <Card className="border-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
          <QrCode className="h-4 w-4" /> Ordering QR code
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div ref={qrWrapRef} className="p-3 bg-white rounded-lg border border-slate-200 flex-shrink-0">
            <QRCodeCanvas value={restaurant.orderingUrl} size={160} level="M" />
          </div>
          <div className="flex-1 space-y-2 text-center sm:text-left">
            <p className="text-sm text-muted-foreground">
              Print this on tables, receipts or signage — scanning it takes customers straight to your ordering page.
            </p>
            <div className="flex flex-wrap gap-2 justify-center sm:justify-start pt-1">
              <Button variant="outline" size="sm" onClick={downloadPng}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> Download PNG
              </Button>
              <Button variant="outline" size="sm" onClick={downloadPdf}>
                <FileText className="h-3.5 w-3.5 mr-1.5" /> Download PDF
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
