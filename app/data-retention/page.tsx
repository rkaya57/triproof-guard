import { LegalPageLayout } from "@/components/legal/legal-page-layout"

export const metadata = {
  title: "Data Retention | Tri-Proof Guard",
  description: "The current retention approach for Tri-Proof Guard account, analysis, API, payment-reference, and Telegram Guardian records.",
}

export default function DataRetentionPage() {
  return (
    <LegalPageLayout eyebrow="Data retention" title="Keep evidence long enough to be useful, not forever by default." summary="This page explains the current operational lifecycle for product records and how to request deletion. It should be read with our Privacy Policy.">
      <h2>1. Retention principle</h2>
      <p>We retain information for as long as reasonably necessary to operate the service, provide requested reports and history, maintain security and abuse controls, meet accounting or legal obligations, resolve disputes, and enforce our agreements. We review retention as product capabilities change.</p>
      <h2>2. Current record categories</h2>
      <ul>
        <li><strong>Account and access records:</strong> retained while an account is active and for a limited period afterward where needed for security, fraud prevention, support, or legal obligations.</li>
        <li><strong>Campaign, wallet, Sybil, and ScamGuard analysis records:</strong> retained while the associated account, project, report, or paid access remains active so users can review evidence, exports, decisions, and historical context.</li>
        <li><strong>API keys, usage, and webhook delivery records:</strong> retained while the integration is active and afterward as needed for debugging, rate-limit enforcement, security review, billing, and dispute handling. API key material is stored as a hash rather than a recoverable plaintext value.</li>
        <li><strong>Telegram Guardian records:</strong> retained while a group is connected and for a limited operational period after removal or disablement to investigate alerts, abuse, and delivery issues.</li>
        <li><strong>Payment and subscription references:</strong> retained as necessary for payment verification, access entitlements, accounting, tax, security, and legal recordkeeping.</li>
        <li><strong>Security logs and feedback:</strong> retained for as long as reasonably necessary to protect the service, investigate false positives or missed risk, and improve detection integrity.</li>
      </ul>
      <h2>3. Current product state</h2>
      <p>Automated self-service deletion schedules are not yet available for every record type. Until they are, records are handled through account controls and verified support requests rather than a promise of instant, universal erasure. We do not preserve an original CSV as a standalone file merely to keep it; related analysis records may remain until deletion or the retention need ends.</p>
      <h2>4. Deletion requests</h2>
      <p>To request account or data deletion, contact <a href="mailto:info@triproofprotocol.com?subject=Tri-Proof%20Data%20Deletion%20Request">info@triproofprotocol.com</a> from your account email and describe the record or project involved. We may request identity verification. Deletion may remove access to reports, credits, API configuration, group history, and related product functionality. We may retain minimal information where necessary for legal obligations, security, fraud prevention, audit trails, or to complete a request already in progress.</p>
      <h2>5. Backups and de-identification</h2>
      <p>Deleted information may persist in encrypted backups for a limited operational cycle before being overwritten. Where practical, we may de-identify or aggregate records so they can support reliability and security improvements without remaining linked to a specific account.</p>
      <h2>6. Enterprise agreements</h2>
      <p>Enterprise or B2B customers may require a separate retention schedule, data-processing agreement, or deletion workflow. A signed agreement controls if it conflicts with this public policy.</p>
    </LegalPageLayout>
  )
}
