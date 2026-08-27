import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FileDown,
  FileSpreadsheet,
  History,
  Network,
  PlayCircle,
} from "lucide-react"

import { DocsCodeBlock } from "@/components/docs/docs-code-block"
import {
  DocsCallout,
  DocsNextLinks,
  DocsPageIntro,
  ProductDocsShell,
} from "@/components/docs/product-docs-shell"
import { buttonVariants } from "@/components/ui/button"

export const metadata = {
  title: "Campaign Analysis Guide | Tri-Proof Documentation",
  description:
    "Create a campaign, prepare wallet cohorts, run Sybil analysis, investigate results, and export Allow, Review, and Exclude decisions with Tri-Proof.",
}

const toc = [
  { id: "when-to-use", label: "When to use it" },
  { id: "prepare", label: "Prepare the cohort" },
  { id: "create", label: "Create a campaign" },
  { id: "run", label: "Run the analysis" },
  { id: "read-results", label: "Read the results" },
  { id: "investigate", label: "Investigate" },
  { id: "export", label: "Export decisions" },
  { id: "repeat", label: "Repeat & compare" },
]

const basicCsv = `wallet
7Yk...SolanaWalletOne
4Pq...SolanaWalletTwo
9Ds...SolanaWalletThree`

const contextualCsv = `wallet,referrer_address,referral_code,campaign_event_at,campaign_event_type,campaign_points
7Yk...WalletOne,8Ab...Referrer,ALPHA42,2026-08-20T12:30:00Z,quest_complete,420
4Pq...WalletTwo,8Ab...Referrer,ALPHA42,2026-08-20T12:31:10Z,quest_complete,420`

const createCampaign = `curl -X POST https://triproofprotocol.com/api/v2/campaigns \\
  -H "Authorization: Bearer $TRIPROOF_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Season 2 Rewards",
    "campaignType": "Airdrop",
    "chain": "Solana",
    "riskPolicy": "balanced",
    "rewardPoolUsd": 25000,
    "startsAt": "2026-08-01T00:00:00Z",
    "endsAt": "2026-09-01T00:00:00Z"
  }'`

const runCsv = `curl -X POST https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses \\
  -H "Authorization: Bearer $TRIPROOF_API_KEY" \\
  -F "csvFile=@participants.csv" \\
  -F "analysisMode=onchain"`

const runJson = `curl -X POST https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses \\
  -H "Authorization: Bearer $TRIPROOF_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "analysisMode": "onchain",
    "wallets": [
      { "wallet": "7Yk...WalletOne" },
      { "wallet": "4Pq...WalletTwo", "campaignPoints": 420 }
    ]
  }'`

export default function CampaignAnalysisDocsPage() {
  return (
    <ProductDocsShell currentPath="/docs/campaign-analysis" toc={toc}>
      <DocsPageIntro
        eyebrow="Product guide"
        title="Run a campaign analysis from cohort to decision package"
        description="Use Campaign Analysis when you need to review airdrop, points, quest, referral, testnet, allowlist, or reward participants before distribution. The durable campaign keeps repeated analysis runs, policy history, investigations, and exports together."
      >
        <Link href="/dashboard/campaigns/new" className={buttonVariants()}>
          Create a campaign
        </Link>
        <Link href="/docs/api/v2" className={buttonVariants({ variant: "outline" })}>
          Use the API instead
        </Link>
      </DocsPageIntro>

      <section id="when-to-use" className="scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">When to use Campaign Analysis</h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Use it when the unit you care about is a participant wallet cohort and the operational question is whether each wallet should be allowed automatically, reviewed by a human, or excluded under the campaign policy. It is designed for repeatable campaign operations, not one isolated score lookup.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            ["Airdrops & retroactive rewards", "Review participant quality and coordinated wallet relationships before allocation."],
            ["Points & leaderboard programs", "Investigate multi-wallet participation, referrals, timing, and reward-specific context."],
            ["Testnets & quests", "Separate thin campaign-only behavior from stronger organic usage without treating one weak signal as proof."],
            ["Allowlist / loyalty campaigns", "Keep a durable audit trail across repeated participant snapshots and policy versions."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-xl border border-border/75 bg-card/25 p-4">
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="prepare" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <FileSpreadsheet className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">1. Prepare the wallet cohort</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          The minimum input is one valid wallet-address column. For the simplest pilot, that is all you need. The CSV parser accepts common headers including <code className="rounded bg-muted px-1.5 py-0.5 text-xs">wallet</code>, <code className="rounded bg-muted px-1.5 py-0.5 text-xs">wallet_address</code>, <code className="rounded bg-muted px-1.5 py-0.5 text-xs">address</code>, <code className="rounded bg-muted px-1.5 py-0.5 text-xs">public_address</code>, <code className="rounded bg-muted px-1.5 py-0.5 text-xs">wallet_pubkey</code>, or <code className="rounded bg-muted px-1.5 py-0.5 text-xs">pubkey</code>.
        </p>
        <div className="mt-5">
          <DocsCodeBlock label="participants.csv" language="csv" code={basicCsv} />
        </div>
        <p className="mt-5 text-sm leading-7 text-muted-foreground">
          If your campaign platform already has useful context, you can add it. Referral address/code, campaign event time/type, points, customer review labels, known-entity context, and a pre-hashed participant fingerprint can strengthen investigation context. These imported values do not silently override Tri-Proof decisions.
        </p>
        <div className="mt-5">
          <DocsCodeBlock label="participants-with-context.csv" language="csv" code={contextualCsv} />
        </div>
        <DocsCallout title="Keep one canonical chain per campaign" tone="info">
          Create the campaign with its target chain and submit addresses valid for that chain. Supported campaign chains are Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, and Solana. If you need materially separate chain cohorts, keep them in clearly scoped campaign workflows rather than mixing identity semantics in one file.
        </DocsCallout>
        <DocsCallout title="Do not upload raw device IDs, IP addresses, or emails" tone="warning">
          Participant fingerprint context accepts only an already-derived one-way hexadecimal hash. Raw personal identifiers are intentionally not accepted as participant fingerprints.
        </DocsCallout>
      </section>

      <section id="create" className="mt-14 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">2. Create the campaign</h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          In the dashboard, open <strong className="font-medium text-foreground">Campaigns → New Campaign</strong>. Choose the chain and policy before analysis starts. The campaign begins as a durable resource so future cohorts can be analyzed under the same operational context.
        </p>
        <div className="mt-5 rounded-xl border border-border/75 bg-card/25 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Recommended intake fields</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              ["Name", "A recognizable campaign / season name."],
              ["Chain", "The canonical chain used to validate and enrich wallet addresses."],
              ["Risk policy", "conservative, balanced, or strict. Policy changes are versioned."],
              ["Campaign type", "Airdrop or the campaign classification used by your workflow."],
              ["Reward pool", "Optional USD context for campaign operations."],
              ["Contracts / program IDs", "Optional campaign-specific on-chain identifiers."],
            ].map(([term, definition]) => (
              <div key={term}>
                <dt className="text-sm font-medium">{term}</dt>
                <dd className="mt-1 text-xs leading-5 text-muted-foreground">{definition}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mt-5">
          <DocsCodeBlock label="Create campaign" language="bash" code={createCampaign} />
        </div>
      </section>

      <section id="run" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <PlayCircle className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">3. Run the analysis</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          From the dashboard campaign workspace, upload the cohort and start the run. API clients can use multipart CSV or JSON. Real on-chain analysis requires a configured real provider; mock wallet history is not accepted by the campaign-native API path.
        </p>
        <div className="mt-5 space-y-4">
          <DocsCodeBlock label="CSV upload" language="bash" code={runCsv} />
          <DocsCodeBlock label="JSON input" language="bash" code={runJson} />
        </div>
        <DocsCallout title="The campaign policy is stable for the run" tone="success">
          A run cannot silently switch to a different policy. If you want to change policy, activate a new version first; that new policy applies to future runs and does not rewrite historical decisions.
        </DocsCallout>
      </section>

      <section id="read-results" className="mt-14 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">4. Read the results in the right order</h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Start with operational state, then inspect the evidence. Do not sort solely by a numeric risk score and assume that every high-looking relationship means common ownership.
        </p>
        <ol className="mt-5 space-y-4">
          {[
            ["Allow", "Candidate for automatic inclusion under the stored policy and available evidence."],
            ["Review", "Human context is required because evidence is uncertain, incomplete, or meaningful without being conclusive."],
            ["Exclude", "Not suitable for automatic inclusion under the stored decision context. Inspect the evidence before irreversible campaign action."],
          ].map(([title, text], index) => (
            <li key={title} className="flex gap-3 rounded-xl border border-border/75 p-4">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
              <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="investigate" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <Network className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">5. Investigate Review and cluster cases</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Open the analysis workspace and drill into suspicious clusters or relationship components. Use the graph together with evidence and timeline views. The purpose is to understand how the wallets are related, what supports the grouping, and what alternative explanation may weaken the case.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            [CheckCircle2, "Confirm the observation", "Which wallets, funding origins, referrals, timing events, or graph relationships are actually persisted?"],
            [CircleAlert, "Check the boundary", "Is the evidence risk-bearing, corroborating, neutralized infrastructure, or merely investigation context?"],
            [Network, "Look for independent support", "A stronger case usually combines independent evidence families instead of counting the same funding relationship twice."],
            [History, "Use chronology", "Timeline context can show whether relationships happened in a tight campaign window or are ordinary historical activity."],
          ].map(([Icon, title, text]) => (
            <div key={String(title)} className="rounded-xl border border-border/75 bg-card/25 p-4">
              <Icon className="size-4 text-primary" />
              <h3 className="mt-3 text-sm font-semibold">{String(title)}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{String(text)}</p>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <Link href="/docs/investigations" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            Open the investigation guide
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section id="export" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <FileDown className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">6. Export the operational handoff</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Use the Campaign Decision Package for the latest operational handoff. Use exact-run persisted decisions when you need an audit-safe historical snapshot. Cluster case exports are available as JSON, CSV, and Markdown for focused investigation handoff.
        </p>
        <DocsCallout title="Exports do not create a second decision engine" tone="info">
          Export and historical resources read persisted decision state and evidence context. They do not silently re-run current policy, re-score evidence, or change cluster membership during retrieval.
        </DocsCallout>
      </section>

      <section id="repeat" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <History className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">7. Repeat the campaign without losing history</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Upload a later cohort to the same campaign. The Run Catalog lets you discover historical runs; exact-run Decisions preserve the stored state; Run Decision Diff shows wallets whose persisted execution state or audit context changed between two runs.
        </p>
        <div className="mt-5 rounded-xl border border-border/75 bg-muted/20 p-4 font-mono text-xs leading-6 text-muted-foreground">
          Run Catalog → exact-run Decisions → Run Decision Diff
        </div>
      </section>

      <DocsNextLinks
        items={[
          {
            href: "/docs/investigations",
            label: "Investigate a wallet relationship",
            description: "Learn the graph, evidence, timeline, support-confidence, and analyst-review workflow.",
          },
          {
            href: "/docs/api/v2/runs",
            label: "Automate run history",
            description: "Use the Campaign API v2 run catalog and exact-run audit resources.",
          },
        ]}
      />
    </ProductDocsShell>
  )
}
