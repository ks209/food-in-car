// Receipt printing for thermal ("hot ink") printers.
//
// Settings live per DEVICE (localStorage), not per restaurant: the printer
// belongs to the counter, and one outlet may have an 80mm printer on a PC and
// a 58mm Bluetooth one on a tablet.
//
// Two ways to print:
//   browser — window.print() with the page sized to the paper. Works anywhere
//             the printer is installed as a system printer. Launch Chrome with
//             --kiosk-printing and it prints with no dialog at all.
//   rawbt   — hands plain ESC/POS text to the RawBT app via a rawbt: link, for
//             Bluetooth printers on Android, which aren't system printers.

const KEY = "carkhanaa-print-settings"

export const DEFAULT_PRINT_SETTINGS = {
  // Defaults to A4 — i.e. exactly how printing behaved before thermal support
  // existed. A restaurant with a receipt printer picks 58/80mm in Printer
  // setup; nobody gets a surprise 80mm-shaped bill on their office printer.
  paper: "a4",        // "58" | "80" | "a4"
  mode: "browser",    // "browser" | "rawbt"
  autoPrint: false,   // print the moment a bill is created
  copies: 1,          // customer + kitchen, say
}

export function loadPrintSettings() {
  try {
    return { ...DEFAULT_PRINT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }
  } catch {
    return { ...DEFAULT_PRINT_SETTINGS }
  }
}

export function savePrintSettings(settings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch { /* storage blocked */ }
  applyPaperSize(settings.paper)
}

// @page can't read CSS variables, so the paper size is injected as its own
// stylesheet and swapped when the setting changes. The data attribute drives
// the layout rules in globals.css.
export function applyPaperSize(paper = DEFAULT_PRINT_SETTINGS.paper) {
  if (typeof document === "undefined") return
  document.documentElement.setAttribute("data-paper", paper)
  const id = "thermal-page-size"
  const existing = document.getElementById(id)
  const css = paper === "a4"
    ? "@media print { @page { size: auto; margin: 10mm; } }"
    : `@media print { @page { size: ${paper}mm auto; margin: 0; } }`
  if (existing) { existing.textContent = css; return }
  const style = document.createElement("style")
  style.id = id
  style.textContent = css
  document.head.appendChild(style)
}

// Characters per line on a thermal printer at normal font size.
const COLUMNS = { "58": 32, "80": 48, a4: 48 }

const money = (n) => `₹${Number(n || 0).toFixed(2)}`

// Plain-text receipt for RawBT. Monospace columns, so amounts line up the way
// they do on any till roll.
export function buildReceiptText(order, paper = "80") {
  const cols = COLUMNS[paper] || 48
  const line = (char = "-") => char.repeat(cols)
  const center = (text) => {
    const t = String(text).slice(0, cols)
    const pad = Math.max(0, Math.floor((cols - t.length) / 2))
    return " ".repeat(pad) + t
  }
  // name on the left, amount right-aligned; the name wraps rather than truncating
  const row = (left, right) => {
    const r = String(right)
    const width = cols - r.length - 1
    const l = String(left)
    if (l.length <= width) return `${l}${" ".repeat(cols - l.length - r.length)}${r}`
    const head = l.slice(0, width)
    const tail = l.slice(width)
    return `${head} ${r}\n${tail}`
  }

  const r = order.restaurant || {}
  const out = []
  out.push(center(r.name || "Restaurant"))
  if (r.address) out.push(center(r.address))
  if (r.phone) out.push(center(r.phone))
  if (order.gstin) out.push(center(`GSTIN: ${order.gstin}`))
  if (r.fssaiLicense) out.push(center(`FSSAI: ${r.fssaiLicense}`))
  out.push(line("="))
  out.push(`Bill : ${order.dailyOrderNumber ?? order.id}`)
  out.push(`Date : ${new Date(order.createdAt).toLocaleString()}`)
  if (order.guestName) out.push(`Name : ${order.guestName}`)
  if (order.guestVehicle) out.push(`Vehicle: ${order.guestVehicle}`)
  out.push(`Pay  : ${order.paymentMethod === "PHONEPE" ? "PhonePe" : "Cash"}`)
  out.push(line())
  for (const item of order.orderItems || []) {
    out.push(row(`${item.quantity} x ${item.name}`, money(item.finalPrice * item.quantity)))
    if (item.options?.length) out.push(`   ${item.options.map((o) => o.name).join(", ")}`)
  }
  out.push(line())
  if (order.gstin && order.gstAmount > 0) {
    const half = order.gstAmount / 2
    out.push(row("Taxable", money(order.totalAmount - order.gstAmount)))
    out.push(row(`CGST ${order.gstRate / 2}%`, money(half)))
    out.push(row(`SGST ${order.gstRate / 2}%`, money(half)))
  }
  out.push(row("TOTAL", money(order.totalAmount)))
  if (order.cashReceived != null) {
    out.push(row("Cash", money(order.cashReceived)))
    out.push(row("Change", money(order.cashReceived - order.totalAmount)))
  }
  out.push(line("="))
  out.push(center("Thank you!"))
  out.push("\n\n\n") // feed clear of the tear bar
  return out.join("\n")
}

// RawBT takes base64 text on a rawbt: URL. The app must be installed and the
// printer paired; nothing happens if it isn't, so the caller warns the user.
export function printViaRawBT(order, paper) {
  const text = buildReceiptText(order, paper)
  const encoded = btoa(unescape(encodeURIComponent(text)))
  window.location.href = `rawbt:base64,${encoded}`
}
