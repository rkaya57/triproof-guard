import { LegalPageLayout } from "@/components/legal/legal-page-layout"

export const metadata = {
  title: "API Terms | Tri-Proof Guard",
  description: "Terms for using the Tri-Proof Guard ScamGuard and Sybil analysis APIs.",
}

export default function ApiTermsPage() {
  return (
    <LegalPageLayout eyebrow="API terms" title="Build with the API, keep the safety context intact." summary="These API Terms apply to developers and organizations using Tri-Proof Guard’s ScamGuard and Sybil analysis endpoints. They supplement the Terms of Service.">
      <h2>1. API access</h2>
      <p>API access is available only to authenticated customers with an eligible plan or a separate written agreement. We may issue, rotate, revoke, or limit an API key to protect the service and its users. Keep your key server-side, never expose it in client-side code, and rotate it immediately if you suspect disclosure.</p>
      <h2>2. Allowed use</h2>
      <p>You may use the API to power your own authorized Web3 safety, campaign-review, or operational workflow. You must obtain all necessary permissions and notices for the information you submit, including wallet addresses, URLs, group information, transaction payloads, and analysis data.</p>
      <h2>3. Plan limits and fair use</h2>
      <p>Usage quotas, rate limits, and available endpoints are determined by your plan and product documentation. We may enforce limits, queue work, return errors, or suspend keys where traffic threatens stability, attempts to evade plan controls, or appears abusive. Do not create multiple accounts or keys to bypass quotas.</p>
      <h2>4. Output and user communication</h2>
      <p>API output is decision-support information. If you show an API result to an end user, preserve the essential risk context: the result is time-bound, evidence-based, and not a safety guarantee. Do not relabel a score as a certification, approval, audit opinion, or instruction to transact.</p>
      <h2>5. Prohibited API use</h2>
      <ul>
        <li>Do not use the API to collect seed phrases, private keys, passwords, biometric data, or credentials.</li>
        <li>Do not use results to make unlawful profiling, discrimination, or solely automated high-impact decisions about individuals.</li>
        <li>Do not probe endpoints, train a competing detection service from outputs, resell raw API output, or remove attribution and risk limitations without written permission.</li>
        <li>Do not transmit malware, harmful payloads, or any data you lack the right to process.</li>
      </ul>
      <h2>6. Availability, changes, and third parties</h2>
      <p>Endpoints may depend on blockchain nodes, threat intelligence, sandboxes, AI services, and other third-party systems. We do not guarantee uninterrupted availability, a specific response time, or complete coverage. We may change or deprecate endpoints with reasonable notice where practical; customers should build retry logic, validation, and graceful failure handling.</p>
      <h2>7. Security and incident notice</h2>
      <p>You must implement reasonable technical and organizational safeguards for keys and API responses. Tell us promptly at <a href="mailto:info@triproofprotocol.com?subject=Tri-Proof%20API%20Security%20Report">info@triproofprotocol.com</a> if you discover suspected key compromise, misuse, or a security issue involving the API.</p>
      <h2>8. Order of precedence</h2>
      <p>These API Terms, the Terms of Service, Privacy Policy, and Risk Disclosure apply to API use. A signed enterprise agreement or data-processing agreement controls to the extent it conflicts with these public terms.</p>
    </LegalPageLayout>
  )
}
