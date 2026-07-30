import { LegalPageLayout } from "@/components/legal/legal-page-layout"

export const metadata = {
  title: "Risk Disclosure | Tri-Proof Guard",
  description: "Important limitations for ScamGuard, Sybil analysis, Telegram Guardian, transaction decoding, and AI-assisted explanations.",
}

export default function RiskDisclosurePage() {
  return (
    <LegalPageLayout eyebrow="Risk disclosure" title="A safety signal is not a safety guarantee." summary="Web3 activity carries material technical, financial, and operational risk. Read this disclosure before relying on a ScamGuard result, Sybil analysis, Telegram alert, or API response.">
      <h2>1. What a result means</h2>
      <p>Tri-Proof Guard combines submitted information, observed chain data, local rules, optional external intelligence, and sometimes AI-assisted explanations. A Safe, Caution, High Risk, Critical, or similar result reflects the evidence available at the time of the scan. It is not a promise that an interaction is safe or unsafe.</p>
      <h2>2. No transaction approval</h2>
      <p>Tri-Proof Guard cannot see every wallet prompt, future state change, hidden contract behavior, or off-chain agreement. Always read the wallet’s final confirmation screen and independently verify the destination, amount, token, permissions, approvals, and transaction instructions before signing. Never sign a prompt you do not understand.</p>
      <h2>3. Web3-specific risks</h2>
      <ul>
        <li>Smart contracts, bridges, token approvals, token extensions, proxies, and external websites can change or behave unexpectedly.</li>
        <li>Scammers can copy legitimate designs, domains, social accounts, and message formats. A visual match or clean scan does not prove legitimacy.</li>
        <li>Blockchain data, third-party RPC responses, threat feeds, and sandbox results can be incomplete, delayed, unavailable, or wrong.</li>
        <li>Sybil analysis identifies patterns and risk indicators; it does not establish identity, fraud, intent, or legal responsibility.</li>
      </ul>
      <h2>4. AI and automated explanations</h2>
      <p>AI-assisted explanations are generated from available evidence to improve readability. They may omit context or express an uncertain inference poorly. Deterministic evidence, wallet prompts, official project sources, and qualified human review should take priority over an AI summary.</p>
      <h2>5. No financial, legal, or security advice</h2>
      <p>Nothing in the service is investment, tax, legal, financial, security-audit, or compliance advice. Tri-Proof Guard does not recommend buying, selling, holding, approving, rejecting, or transacting with any asset or project. You are responsible for your own decisions and for obtaining professional advice when appropriate.</p>
      <h2>6. Recommended safety behavior</h2>
      <p>Use a hardware or limited-funds wallet for testing, open projects from verified official sources, compare requested permissions against your intended action, revoke unwanted approvals through trusted tools, and stop immediately if a site asks for a seed phrase or private key. If you suspect compromise, disconnect, move assets only after independent verification, and seek qualified assistance.</p>
      <h2>7. Emergency and reporting</h2>
      <p>Do not rely on Tri-Proof Guard as an emergency-response service. If you find a suspected false positive, missed risk, or abuse pattern, submit feedback through the product or contact <a href="mailto:info@triproofprotocol.com">info@triproofprotocol.com</a>. Reports are reviewed as operational intelligence, not as a guaranteed incident-response commitment.</p>
    </LegalPageLayout>
  )
}
