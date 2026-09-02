import {
  installBoundedFetchTimeout,
  neutralizeLegacyTrustedDomainBypass,
} from "./background-hardening.js"

installBoundedFetchTimeout()

// MV3 service workers must register their runtime listeners immediately.
// Storage migrations can stall or be suspended during startup, so they must
// never gate importing the background module. The migration still runs on
// every worker start, but failure/delay cannot make ScamGuard unresponsive.
await import("./background.js")
void neutralizeLegacyTrustedDomainBypass().catch(() => {})
