export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (char === "," && !quoted) {
      row.push(cell)
      cell = ""
      continue
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1
      row.push(cell)
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      cell = ""
      continue
    }
    cell += char
  }

  if (quoted) throw new Error("CSV contains an unterminated quoted field")
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    if (row.some((value) => value.length > 0)) rows.push(row)
  }
  return rows
}

export function parseCsvObjects(text: string): Array<Record<string, string>> {
  const rows = parseCsvRows(text.trim())
  const headers = rows.shift() ?? []
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])))
}

export function escapeCsvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function stringifyCsvObjects(headers: string[], rows: Array<Record<string, string>>) {
  return [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header] ?? "")).join(",")),
  ].join("\n") + "\n"
}
