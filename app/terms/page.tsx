import { LegalPageLayout } from "@/components/legal/legal-page-layout"

export const metadata = {
  title: "Terms of Service | Tri-Proof Guard",
  description: "The terms governing use of Tri-Proof Guard, its accounts, subscriptions, scans, analysis, and related services.",
}

export default function TermsPage() {
  return (
    <LegalPageLayout eyebrow="Terms of service" title="Terms for using Tri-Proof Guard." summary="These Terms govern your use of Tri-Proof Guard’s website, analysis products, extension, Telegram services, subscriptions, and API unless a signed enterprise agreement says otherwise.">
      <h2>1. Acceptance and eligibility</h2>
      <p>By accessing or using the service, you agree to these Terms and confirm that you can form a binding agreement where you live. If you use the service for an organization, you represent that you are authorized to accept these Terms for that organization.</p>
      <h2>2. What the service does</h2>
      <p>Tri-Proof Guard provides automated risk intelligence for Web3 surfaces, including pre-sign explanations, URL and domain checks, wallet and campaign analysis, Sybil signals, Telegram group monitoring, reports, and APIs. It is a decision-support product, not a wallet, exchange, custodian, broker, legal advisor, financial advisor, or security guarantee.</p>
      <h2>3. Accounts and access</h2>
      <p>You must provide accurate account information, keep your login credentials and API keys confidential, and notify us promptly of unauthorized use. You are responsible for activity performed through your account, API keys, connected integrations, and Telegram groups. We may suspend access to protect users, investigate abuse, or enforce these Terms.</p>
      <h2>4. Acceptable use</h2>
      <ul>
        <li>Use the service only for lawful purposes and only with authority over submitted data, wallets, groups, domains, and API integrations.</li>
        <li>Do not submit seed phrases, private keys, credentials, malware, or data you are not allowed to process.</li>
        <li>Do not reverse engineer, bypass rate limits, probe for vulnerabilities, scrape results at scale, or interfere with service availability.</li>
        <li>Do not use scores, labels, or reports to make unlawful discriminatory, financial, employment, or identity decisions.</li>
        <li>Do not present a Tri-Proof Guard result as a guarantee, certification, audit opinion, or endorsement without our written permission.</li>
      </ul>
      <h2>5. Plans, payments, and renewals</h2>
      <p>Paid access is sold as a fixed 30-day product access pass or a separately disclosed analysis-credit package. Prices may be shown in USDC or a live SOL equivalent. Payments are manually initiated and verified on-chain; the product does not create recurring wallet transfers or take custody of funds. Unless required by applicable law or explicitly agreed in writing, completed on-chain payments are non-refundable after the relevant access or credits are provisioned.</p>
      <h2>6. Your content and feedback</h2>
      <p>You retain rights in data you submit. You grant us the limited rights needed to host, process, analyze, display, secure, and improve the service. If you submit feedback or a false-positive/false-negative report, you allow us to use it to investigate and improve the product without compensation, while respecting the Privacy Policy.</p>
      <h2>7. Intellectual property</h2>
      <p>Tri-Proof Guard, its software, detection logic, interface, and documentation are owned by Tri-Proof Protocol or its licensors. Subject to these Terms, we grant you a limited, non-exclusive, non-transferable right to use the service during your access period.</p>
      <h2>8. Disclaimers and limits</h2>
      <p>The service is provided on an “as is” and “as available” basis. Scores, explanations, AI-assisted summaries, and external intelligence can be incomplete, delayed, inaccurate, or unavailable. To the maximum extent permitted by law, Tri-Proof Protocol disclaims implied warranties and is not liable for losses resulting from wallet signatures, transactions, investment decisions, smart-contract interactions, third-party sites, or reliance on a service result.</p>
      <h2>9. Suspension, termination, and changes</h2>
      <p>You may stop using the service at any time. We may suspend or end access for abuse, legal risk, non-payment, or security reasons. We may change the service or these Terms as it evolves; material changes will be posted with an updated date. A signed enterprise agreement controls if it conflicts with these Terms.</p>
      <h2>10. Contact and governing framework</h2>
      <p>Contact <a href="mailto:info@triproofprotocol.com">info@triproofprotocol.com</a> with a Terms question. Mandatory consumer protections and any signed commercial agreement continue to apply. Before entering a regulated, high-value, or enterprise deployment, parties should agree the contracting entity, governing law, and dispute process in writing.</p>
    </LegalPageLayout>
  )
}
