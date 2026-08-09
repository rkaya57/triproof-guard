type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue }

function canonicalizeJson(value: unknown): CanonicalJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Canonical JSON does not support non-finite numbers.")
    }
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJson(item))
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    const canonical: Record<string, CanonicalJsonValue> = {}
    for (const key of Object.keys(record).sort()) {
      const item = record[key]
      if (item === undefined) continue
      canonical[key] = canonicalizeJson(item)
    }
    return canonical
  }

  throw new Error("Canonical JSON supports only JSON-compatible values.")
}

export function canonicalJsonStringify(value: unknown) {
  return JSON.stringify(canonicalizeJson(value))
}
