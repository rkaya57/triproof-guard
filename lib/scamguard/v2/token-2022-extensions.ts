export type Token2022ExtensionSeverity = "info" | "low" | "medium" | "high"

export type Token2022ExtensionFinding = {
  extension: string
  severity: Token2022ExtensionSeverity
  category: "authority" | "transfer" | "privacy" | "metadata" | "account_behavior" | "other"
  title: string
  detail: string
}

export type Token2022ExtensionInspection = {
  source: "solana-token-2022"
  extensions: string[]
  findings: Token2022ExtensionFinding[]
  controlSurfaceCount: number
  highestSeverity: Token2022ExtensionSeverity
  note: string
}

const severityRank: Record<Token2022ExtensionSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
}

const extensionCatalog: Record<string, Omit<Token2022ExtensionFinding, "extension">> = {
  TransferFeeConfig: {
    severity: "medium",
    category: "transfer",
    title: "Transfer-fee configuration enabled",
    detail: "Token-2022 transfer fees can alter the amount received by users. Review fee authority and current fee settings before treating transfers as equivalent to standard SPL behavior.",
  },
  MintCloseAuthority: {
    severity: "medium",
    category: "authority",
    title: "Mint close authority enabled",
    detail: "The mint has Token-2022 close-authority capability. This is a control surface that should be disclosed and reviewed; it is not malicious by itself.",
  },
  DefaultAccountState: {
    severity: "medium",
    category: "account_behavior",
    title: "Default account state configured",
    detail: "New token accounts can inherit a configured default state such as frozen. Review the controlling authority and expected account behavior.",
  },
  NonTransferable: {
    severity: "low",
    category: "transfer",
    title: "Non-transferable token",
    detail: "This Token-2022 mint restricts transfers by design. The restriction can be legitimate but materially changes user expectations and liquidity behavior.",
  },
  InterestBearingConfig: {
    severity: "low",
    category: "account_behavior",
    title: "Interest-bearing display configuration",
    detail: "The mint uses Token-2022 interest-bearing configuration. Verify how displayed balances or rates are represented before presenting economic assumptions to users.",
  },
  PermanentDelegate: {
    severity: "high",
    category: "authority",
    title: "Permanent delegate enabled",
    detail: "A Token-2022 permanent delegate is an elevated authority surface. Tri-Proof should expose the delegate identity and require additional review before high-value interaction.",
  },
  TransferHook: {
    severity: "medium",
    category: "transfer",
    title: "Transfer hook enabled",
    detail: "Token transfers can invoke an additional program through the Token-2022 transfer-hook extension. Review the hook program and its behavior before signing.",
  },
  ConfidentialTransferMint: {
    severity: "low",
    category: "privacy",
    title: "Confidential transfers supported",
    detail: "The mint supports Token-2022 confidential transfer behavior. This changes visibility and analysis assumptions but is not itself a malicious signal.",
  },
  ConfidentialTransferFee: {
    severity: "low",
    category: "privacy",
    title: "Confidential transfer fees supported",
    detail: "The mint combines confidential-transfer behavior with fee handling. Treat standard transparent-balance assumptions as incomplete.",
  },
  MetadataPointer: {
    severity: "info",
    category: "metadata",
    title: "Metadata pointer enabled",
    detail: "Token metadata can be referenced through Token-2022 metadata-pointer functionality. Validate the target before relying on branding or descriptive metadata.",
  },
  TokenMetadata: {
    severity: "info",
    category: "metadata",
    title: "Token-2022 metadata present",
    detail: "Token-2022 metadata is present. Metadata is descriptive evidence only and should not override mint identity or on-chain authority checks.",
  },
  GroupPointer: {
    severity: "info",
    category: "metadata",
    title: "Token group pointer enabled",
    detail: "The mint participates in Token-2022 group metadata. Group membership is contextual metadata, not a safety guarantee.",
  },
  GroupMemberPointer: {
    severity: "info",
    category: "metadata",
    title: "Token group-member pointer enabled",
    detail: "The mint exposes Token-2022 group-member metadata. Validate group identity independently.",
  },
  PausableConfig: {
    severity: "high",
    category: "authority",
    title: "Pausable token controls enabled",
    detail: "Token-2022 pausable configuration introduces an authority-controlled operational stop surface. Review the pause authority before treating transfer availability as immutable.",
  },
  PermissionedBurn: {
    severity: "high",
    category: "authority",
    title: "Permissioned burn controls enabled",
    detail: "The mint exposes Token-2022 permissioned-burn capability. This is a material authority surface and should be clearly surfaced before interaction.",
  },
}

function normalizeExtensionName(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (!value || typeof value !== "object") return ""
  const record = value as Record<string, unknown>
  const candidate = record.extension ?? record.extensionType ?? record.type ?? record.kind ?? record.name
  return typeof candidate === "string" ? candidate.trim() : ""
}

function collectExtensionValues(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return []
  const record = value as Record<string, unknown>
  const direct = record.extensions
  if (Array.isArray(direct)) return direct

  const data = record.data
  if (data && typeof data === "object") {
    const parsed = (data as Record<string, unknown>).parsed
    if (parsed && typeof parsed === "object") {
      const info = (parsed as Record<string, unknown>).info
      if (info && typeof info === "object" && Array.isArray((info as Record<string, unknown>).extensions)) {
        return (info as Record<string, unknown>).extensions as unknown[]
      }
      if (Array.isArray((parsed as Record<string, unknown>).extensions)) {
        return (parsed as Record<string, unknown>).extensions as unknown[]
      }
    }
  }

  return []
}

export function inspectToken2022Extensions(parsedAccount: unknown): Token2022ExtensionInspection {
  const extensions = Array.from(new Set(
    collectExtensionValues(parsedAccount)
      .map(normalizeExtensionName)
      .filter(Boolean)
  ))

  const findings = extensions.map((extension): Token2022ExtensionFinding => {
    const known = extensionCatalog[extension]
    if (known) return { extension, ...known }
    return {
      extension,
      severity: "info",
      category: "other",
      title: "Token-2022 extension detected",
      detail: `${extension} is enabled on this account. Tri-Proof recognizes the extension but does not currently assign a control-surface severity beyond informational context.`,
    }
  })

  const highestSeverity = findings.reduce<Token2022ExtensionSeverity>((current, finding) =>
    severityRank[finding.severity] > severityRank[current] ? finding.severity : current
  , "info")

  return {
    source: "solana-token-2022",
    extensions,
    findings,
    controlSurfaceCount: findings.filter((finding) => finding.severity === "medium" || finding.severity === "high").length,
    highestSeverity,
    note: "Token-2022 extensions describe capabilities and control surfaces. No extension is treated as proof of maliciousness without corroborating evidence.",
  }
}
