import { neutralizeLegacyTrustedDomainBypass } from "./background-hardening.js"

await neutralizeLegacyTrustedDomainBypass()
await import("./background.js")
