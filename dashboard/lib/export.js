function csvEscape(v) {
  const s = String(v ?? "")
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function rowsToCsv(rows) {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n")
}

// sections: [{ title, rows: [[...header], [...data], ...] }] — rendered as
// stacked tables in one file, a common shape for a spreadsheet-opened report.
export function downloadCsv(filename, sections) {
  const csv = sections.map(({ title, rows }) => `${title}\n${rowsToCsv(rows)}`).join("\n\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
