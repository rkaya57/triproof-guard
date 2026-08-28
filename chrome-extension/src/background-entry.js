import {
  installBoundedFetchTimeout,
  neutralizeLegacyTrustedDomainBypass,
} from "./background-hardening.js"

installBoundedFetchTimeout()
await neutralizeLegacyTrustedDomainBypass()
await import("./background.js")
