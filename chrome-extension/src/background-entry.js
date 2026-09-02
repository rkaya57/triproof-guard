import {
  installBoundedFetchTimeout,
  installBoundedSyncStorage,
  neutralizeLegacyTrustedDomainBypass,
} from "./background-hardening.js"
import "./background.js"

// Chrome extension service workers support static ES-module imports, but not
// dynamic import(). Keep startup fully synchronous so MV3 can finish worker
// registration and make the runtime listeners in background.js available.
installBoundedFetchTimeout()
installBoundedSyncStorage()

// Storage migration is best-effort and must never gate service-worker startup.
void neutralizeLegacyTrustedDomainBypass().catch(() => {})
