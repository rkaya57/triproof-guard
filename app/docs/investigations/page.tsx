import Link from "next/link"
import {
  ArrowRight,
  Clock3,
  FileSearch,
  GitBranch,
  Layers3,
  Network,
  Scale,
  ShieldCheck,
  UserRoundSearch,
} from "lucide-react"

import {
  DocsCallout,
  DocsNextLinks,
  DocsPageIntro,
  ProductDocsShell,
} from "@/components/docs/product-docs-shell"
import { buttonVariants } from "@/components/ui/button"

export const metadata = {
  title: "Wallet & Cluster Investigation Guide | Tri-Proof Documentation",
  description:
    "Learn how to investigate wallet relationships, graph evidence, funding provenance, timelines, cluster support, and analyst context in Tri-Proof.",
}

const toc = [
  { id: "mindset", label: "Investigation mindset" },
  { id: "workspace", label: "Workspace anatomy" },
  { id: "graph", label: "Relationship graph" },
  { id: "evidence", label: "Evidence lanes" },
  { id: "timeline", label: "Timeline" },
  { id: "support", label: "Support confidence" },
  { id: "analyst", label: "Analyst workflow" },
  { id: "stronger-weaker", label: "Strengthen or weaken" },
  { id: "handoff", label: "Handoff & exports" },
]

const evidenceLanes = [
  ["Funding", "Direct funding, shared funders, lineage, neutral service resolution, and persisted funding relationships."],
  ["Transfers", "Stored transfer and circular-path context plus normalized transfer events when available."],
  ["Contracts", "Deployer, factory, implementation, program, and contract-provenance context."],
  ["Behavior", "Stored behavior grouping and existing behavior or automation-related evidence context."],
  ["Timing", "Temporal coordination and campaign-window timing evidence."],
  ["Bridge", "Bridge-related context kept in a dedicated lane so ordinary bridge reuse remains visibly neutral when it should be."],
]

export default function InvestigationsDocsPage() {
  return (
    <ProductDocsShell currentPath="/docs/investigations" toc={toc}>
      <DocsPageIntro
        eyebrow="Investigation guide"
        title="Investigate relationships without turning correlation into identity claims"
        description="Tri-Proof investigations are designed for evidence review, not visual accusation. Use the graph to navigate relationships, then verify the persisted evidence, timeline, neutral explanations, and independent corroboration before taking campaign action."
      >
        <Link href="/dashboard" className={buttonVariants()}>
          Open dashboard
        </Link>
        <Link href="/docs/campaign-analysis" className={buttonVariants({ variant: "outline" })}>
          Campaign workflow
        </Link>
      </DocsPageIntro>

      <section id="mindset" className="scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">Start with an investigation question</h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          A useful investigation starts with a bounded question such as “Why were these wallets grouped?”, “Is this funding origin ordinary infrastructure?”, or “What changed between this wallet&apos;s funding and campaign activity?”. Avoid starting with “prove these wallets are the same person.” Tri-Proof does not establish real-world identity from graph proximity.
        </p>
        <DocsCallout title="Recommended question" tone="success">
          Ask whether the stored evidence is strong enough to justify the operational treatment of the wallet or cluster, and what additional context could change that treatment.
        </DocsCallout>
      </section>

      <section id="workspace" className="mt-14 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">Read the workspace from top to bottom</h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          The investigation surface intentionally separates summary, graph navigation, evidence detail, time context, and analyst interpretation. That separation prevents one visually strong relationship from replacing the underlying evidence review.
        </p>
        <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-border/75 bg-border/75 sm:grid-cols-2">
          {[
            [ShieldCheck, "Decision strip", "Review priority, evidence confidence, ownership boundary, and service-resolution context at a glance."],
            [FileSearch, "Investigation summary", "What was observed, why it matters, the decision boundary, and the recommended next step."],
            [Network, "Relationship canvas", "Directional funding, referral, service, and contract-provenance relationships for navigation."],
            [UserRoundSearch, "Selected-node intelligence", "Overview, evidence, timeline, and analyst context for the node you are inspecting."],
          ].map(([Icon, title, text]) => (
            <div key={String(title)} className="bg-background p-5">
              <Icon className="size-4 text-primary" />
              <h3 className="mt-3 text-sm font-semibold">{String(title)}</h3>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{String(text)}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="graph" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <Network className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">Use the graph as a map, not as the verdict</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Select a wallet or context node to isolate its immediate relationships. Node shape helps distinguish wallets, funding origins, known services, referral context, and contract provenance. Directional edges show the stored relationship type; confidence describes evidence confidence, not the probability of malicious control.
        </p>
        <div className="mt-5 rounded-xl border border-border/75 bg-card/25 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Graph reading order</p>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
            <li><strong className="font-medium text-foreground">1. Select the node.</strong> Identify whether it is a participant wallet, funding origin, service, referral context, or provenance node.</li>
            <li><strong className="font-medium text-foreground">2. Count direct relationships.</strong> Large fan-out is context; it is not automatically malicious.</li>
            <li><strong className="font-medium text-foreground">3. Open Evidence.</strong> Confirm the relationship source, confidence, transaction reference, and risk-bearing or neutralized state.</li>
            <li><strong className="font-medium text-foreground">4. Open Timeline.</strong> Check whether the relationships are tightly coordinated around the campaign or spread across ordinary history.</li>
            <li><strong className="font-medium text-foreground">5. Look for independent support.</strong> Do not double-count the same funding fact simply because it appears in several visual projections.</li>
          </ol>
        </div>
        <DocsCallout title="Shared funder alone is not enough" tone="warning">
          Unknown direct funding can be investigation-relevant, but shared funding by itself does not establish common control. Recognized exchange, bridge, protocol, service, or trusted-distributor fan-out should remain neutral unless separate evidence materially changes the case.
        </DocsCallout>
      </section>

      <section id="evidence" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <Layers3 className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">Filter evidence by forensic lane</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Graph Intelligence separates stored investigation context into lanes. Filtering changes what you see; it does not change the source evidence, cluster membership, wallet score, or stored decision.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {evidenceLanes.map(([title, text]) => (
            <div key={title} className="rounded-xl border border-border/75 bg-card/25 p-4">
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
        <DocsCallout title="Risk-bearing is persisted source semantics" tone="info">
          Investigation filters must not promote a neutralized item into malicious evidence. The same stored relationship can appear in more than one lane for clarity while keeping its original effect unchanged.
        </DocsCallout>
      </section>

      <section id="timeline" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <Clock3 className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">Use time to distinguish coordination from ordinary history</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          The Timeline view orders persisted observation timestamps and transaction references. Look for concentrated funding bursts, closely spaced campaign events, repeated referral timing, or other temporal patterns. Also look for evidence that weakens the hypothesis: broad history, long gaps, unrelated prior activity, or service-mediated fan-out.
        </p>
        <DocsCallout title="Missing timestamps are missing coverage" tone="warning">
          A missing or truncated history window is not proof that a wallet is new, inactive, or malicious. Treat incomplete provider coverage as a limitation and keep uncertain cases in Review when appropriate.
        </DocsCallout>
      </section>

      <section id="support" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <Scale className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">Understand Cluster Support Confidence correctly</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Cluster Support Confidence answers one narrow question: how strongly does the available stored evidence support an already-stored deterministic grouping? It can reflect preserved independent evidence families, member evidence coverage, and qualifying canonical funding support.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.05] p-4">
            <h3 className="text-sm font-semibold">It is</h3>
            <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
              <li>• Evidence-strength context for an existing cluster.</li>
              <li>• A way to inspect family coverage and limitations.</li>
              <li>• Read-only investigation support.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-4">
            <h3 className="text-sm font-semibold">It is not</h3>
            <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
              <li>• A Sybil probability.</li>
              <li>• A wallet risk score.</li>
              <li>• Proof of common ownership or identity.</li>
              <li>• An automatic campaign action.</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="analyst" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <UserRoundSearch className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">Record analyst context without rewriting evidence</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Manual Analyst Actions are append-only hypotheses and proposals. Analysts can record likely-legitimate context, suspicious patterns, needs-review notes, general notes, or merge/split proposals. These records preserve an immutable evidence snapshot for audit and do not apply structural changes automatically.
        </p>
        <DocsCallout title="No hidden apply path" tone="success">
          Analyst proposals do not change stored cluster membership, wallet risk scores, campaign policy, or Allow / Review / Exclude outputs. A proposal is an auditable human hypothesis, not a silent override.
        </DocsCallout>
      </section>

      <section id="stronger-weaker" className="mt-14 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">Ask what would strengthen or weaken the case</h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Professional investigation should be falsifiable. Do not collect only evidence that confirms your first impression.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border/75 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><GitBranch className="size-4 text-primary" /> Evidence that may strengthen</h3>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
              <li>• Independent timing correlation in addition to funding.</li>
              <li>• Repeated referral or campaign-event overlap.</li>
              <li>• Risk-bearing downstream transfer structure.</li>
              <li>• Repeated recurrence across separate campaign runs.</li>
              <li>• Customer-provided campaign context that corroborates the stored pattern.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border/75 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-primary" /> Evidence that may weaken</h3>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
              <li>• Funding origin resolves to recognized neutral infrastructure.</li>
              <li>• Broad public fan-out rather than campaign-specific concentration.</li>
              <li>• Long, heterogeneous organic history across wallets.</li>
              <li>• Provider truncation or missing historical coverage.</li>
              <li>• A plausible project-specific distribution or custody explanation.</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="handoff" className="mt-14 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">Hand off a reproducible investigation</h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          For a focused cluster, export the case package in JSON, CSV, or Markdown. For campaign operations, use the Decision Package. When discussing a case with a customer, keep the wording evidence-based: describe coordinated activity, shared funding, timing similarity, or review candidates instead of publicly labeling addresses as a specific person or malicious actor without sufficient proof.
        </p>
        <div className="mt-5">
          <Link href="/docs/api/v2/clusters/export" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            Read Cluster Case Export reference
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <DocsNextLinks
        items={[
          {
            href: "/docs/api/v2/clusters",
            label: "Cluster API resources",
            description: "Catalog, intelligence, evidence, members, and export resources for product integrations.",
          },
          {
            href: "/docs/trust",
            label: "Trust & evidence boundaries",
            description: "Understand the semantics Tri-Proof deliberately refuses to overstate.",
          },
        ]}
      />
    </ProductDocsShell>
  )
}
