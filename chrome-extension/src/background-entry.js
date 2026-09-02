import {
  installBoundedFetchTimeout,
  installBoundedSyncStorage,
  neutralizeLegacyTrustedDomainBypass,
} from "./background-hardening.js"

installBoundedFetchTimeout()
installBoundedSyncStorage()

// MV3 service workers must register their runtime listeners immediately.
// Storage migrations can stall or be suspended during startup, so they must
// never gate importing the background module. The bounded sync adapter keeps
// settings available from a local fail-safe even when browser sync is disabled.
await import("./background.js")
void neutralizeLegacyTrustedDomainBypass().catch(() => {})
