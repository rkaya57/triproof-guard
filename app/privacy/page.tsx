import { LegalPageLayout } from "@/components/legal/legal-page-layout"

export const metadata = {
  title: "Privacy Policy | Tri-Proof Guard",
  description: "How Tri-Proof Guard processes account, analysis, API, Telegram, and payment-reference information.",
}

export default function PrivacyPage() {
  return (
    <LegalPageLayout eyebrow="Privacy policy" title="Privacy without a custody blind spot." summary="This policy describes the information Tri-Proof Guard processes when you use the website, ScamGuard, Sybil analysis, Telegram Guardian, and B2B API services.">
      <h2>1. Scope and contact</h2>
      <p>Tri-Proof Guard is operated by Tri-Proof Protocol. For privacy requests or questions, email <a href="mailto:info@triproofprotocol.com">info@triproofprotocol.com</a>. This policy applies to the public website, authenticated product areas, browser extension, Telegram bot and Guardian, and API services that link to it.</p>
      <h2>2. Information we process</h2>
      <ul>
        <li><strong>Account information:</strong> name, email address, password hash, session details, subscription state, and account settings.</li>
        <li><strong>Analysis inputs and results:</strong> wallet addresses, chains, campaign names, CSV filenames, uploaded or submitted analysis data, risk signals, graph evidence, feedback, and reports.</li>
        <li><strong>ScamGuard and extension activity:</strong> submitted URLs, domains, wallet addresses, token or contract identifiers, transaction data supplied for decoding, scan decisions, and feedback labels. The extension stores its recent decision history, settings, and observed approval-request ledger locally in the browser unless you explicitly use a server-backed product feature.</li>
        <li><strong>Extension account connection:</strong> a short-lived browser pairing request, device-access token metadata, connected account identifier, and plan entitlement. The extension never receives or stores your Tri-Proof password, wallet private key, seed phrase, or recovery phrase.</li>
        <li><strong>Telegram Guardian data:</strong> group and user identifiers supplied by Telegram, group metadata, scanned message targets, safety alerts, and group management settings.</li>
        <li><strong>API and operational data:</strong> API-key metadata such as a hash, prefix, last four characters, usage counters, request metadata, webhook endpoint configuration, delivery records, and security logs.</li>
        <li><strong>Payment references:</strong> selected plan, network, transaction hash, amount, confirmation state, and related product credits. Tri-Proof Guard does not take custody of assets.</li>
      </ul>
      <h2>3. Information we do not request</h2>
      <p>Do not send us seed phrases, private keys, wallet passwords, recovery phrases, or account credentials. Tri-Proof Guard does not require them, does not provide a field for them, and never asks for them through support, Telegram, the extension, or the API.</p>
      <h2>4. Why we use information</h2>
      <p>We use information to operate and secure accounts, run the requested analysis, present reports, maintain scan limits and subscriptions, prevent abuse, investigate feedback, operate Telegram Guardian, provide support, and improve risk-detection quality. We may use de-identified or aggregated operational observations to improve rules, reliability, and product performance.</p>
      <h2>5. Service providers and disclosures</h2>
      <p>We use infrastructure and specialist providers to host the product, store data, deliver email or support, access blockchain/RPC data, and run optional AI-assisted explanations. Providers may process data only to provide their service to us. We do not sell personal information. We may disclose information where necessary to comply with law, protect users or the service, investigate abuse, or complete a corporate transaction.</p>
      <h2>6. International processing</h2>
      <p>Our infrastructure and providers may process information in countries other than your own. Where required, we use appropriate contractual, technical, and organizational safeguards. You should not submit data that you are not authorized to share or that is subject to restrictions incompatible with this processing.</p>
      <h2>7. Your choices and rights</h2>
      <p>Depending on your location, you may have rights to access, correct, delete, restrict, object to, or receive a copy of certain personal data. You may also revoke an API key, disable a webhook, leave a Telegram group, or close an account through the product where available. To make a request, email us from the address associated with your account. We may need to verify your identity and may retain limited data when required for security, fraud prevention, accounting, or law.</p>
      <h2>8. Security</h2>
      <p>We use access controls, hashed credentials and API-key material, transport security, and operational monitoring designed to protect data. No online service is completely secure; use strong credentials, protect your wallet, and report suspected compromise promptly.</p>
      <h2>9. Changes</h2>
      <p>We may update this policy as the product evolves. Material changes will be posted on this page with a revised effective date. Continued use after an update means you acknowledge the revised policy to the extent permitted by applicable law.</p>
      <p className="legal-note">This policy is a product-facing notice, not a substitute for a jurisdiction-specific legal review before regulated or enterprise deployment.</p>
    </LegalPageLayout>
  )
}
