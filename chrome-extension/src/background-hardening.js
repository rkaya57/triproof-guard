const LEGACY_TRUSTED_DOMAINS_KEY = "trustedDomains"
const TRUSTED_DOMAIN_HINTS_KEY = "scamguardTrustedDomainHints"

function normalizeDomains(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
    .filter(Boolean))]
}

export async function neutralizeLegacyTrustedDomainBypass() {
  const stored = await chrome.storage.sync.get({
    [LEGACY_TRUSTED_DOMAINS_KEY]: [],
    [TRUSTED_DOMAIN_HINTS_KEY]: [],
  })
  const legacy = normalizeDomains(stored[LEGACY_TRUSTED_DOMAINS_KEY])
  const hints = normalizeDomains(stored[TRUSTED_DOMAIN_HINTS_KEY])
  const mergedHints = normalizeDomains([...hints, ...legacy])

  if (legacy.length || mergedHints.length !== hints.length) {
    await chrome.storage.sync.set({
      [LEGACY_TRUSTED_DOMAINS_KEY]: [],
      [TRUSTED_DOMAIN_HINTS_KEY]: mergedHints,
    })
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return
  const next = changes[LEGACY_TRUSTED_DOMAINS_KEY]?.newValue
  if (!Array.isArray(next) || !next.length) return
  void neutralizeLegacyTrustedDomainBypass()
})
