from pathlib import Path
import re

path = Path("components/analysis/analysis-detail.tsx")
with path.open("r", encoding="utf-8", newline="") as handle:
    text = handle.read()

eol = "\r\n" if text.count("\r\n") > text.count("\n") // 2 else "\n"

def block(source: str) -> str:
    return source.strip("\n").replace("\n", eol)

def replace_between(source: str, start_marker: str, end_marker: str, replacement: str) -> str:
    start = source.find(start_marker)
    if start < 0:
        raise SystemExit(f"start marker not found: {start_marker}")
    end = source.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"end marker not found: {end_marker}")
    return source[:start] + block(replacement) + eol + eol + source[end:]

report_ready = r'''
function ReportReadyExperience({
  analysis,
  exportPath,
  onShare,
}: {
  analysis: AnalysisDetailType
  exportPath: string
  onShare: () => void
}) {
  const decision = getDecisionIntelligence(analysis)
  const completedLabel = analysis.completedAt ? formatDateTimeUTC(analysis.completedAt) : "ready now"
  const reviewLabel = analysis.manualReviewCount === 1 ? "wallet" : "wallets"

  return (
    <section className="glass-panel premium-card animated-border overflow-hidden rounded-2xl">
      <div className="border-b border-primary/15 bg-gradient-to-r from-primary/10 via-background/40 to-background/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="border-green-400/30 bg-green-400/10 text-green-200">
            <CheckCircle2 className="size-3.5" />
            Report ready
          </Badge>
          <Badge variant="outline" className="border-primary/30 bg-primary/10 font-mono text-primary">
            {decision.proofId}
          </Badge>
          <Badge variant="outline" className="capitalize">{analysis.riskPolicy ?? "balanced"} policy</Badge>
        </div>
        <div className="mt-4 max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Decision package</p>
          <h2 className="text-gradient mt-2 text-3xl font-semibold sm:text-4xl">Campaign decision package is ready.</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Completed {completedLabel}. The deterministic decision set is ready for project confirmation, with manual-review wallets withheld from the clean export and evidence retained for audit.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
        {[
          ["Evaluated", analysis.totalWallets, "text-foreground"],
          ["Approved", analysis.approvedCount, "text-green-200"],
          ["Manual review", analysis.manualReviewCount, "text-amber-200"],
          ["Excluded", analysis.rejectedCount, "text-red-200"],
        ].map(([label, value, tone], index) => (
          <div key={String(label)} className={cn("px-4 py-4 sm:px-5", index > 0 && "border-l border-border", index > 1 && "max-sm:border-t")}>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={cn("mt-1 text-2xl font-semibold", tone)}>{formatNumber(Number(value))}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <a href={`${exportPath}?type=approved`} className={`${buttonVariants()} glow-primary`}>
            <ClipboardCheck data-icon="inline-start" />
            Export clean list
          </a>
          <Link href={`/dashboard/analysis/${analysis.id}/review`} className={buttonVariants({ variant: "outline" })}>
            <Users data-icon="inline-start" />
            {analysis.manualReviewCount ? `Review ${analysis.manualReviewCount} ${reviewLabel}` : "Review queue"}
          </Link>
          <a href={`${exportPath}?type=pdf`} className={buttonVariants({ variant: "outline" })}>
            <FileText data-icon="inline-start" />
            PDF report
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={onShare}>
            <Share2 data-icon="inline-start" />
            Share
          </Button>
          <a
            href={buildMailto(
              "Tri-Proof Guard report review",
              `Please review this Tri-Proof Guard report:\n\n${analysis.project.name}\nApproved: ${analysis.approvedCount}\nManual review: ${analysis.manualReviewCount}\nExcluded: ${analysis.rejectedCount}\nProof: ${decision.proofId}`
            )}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <Mail data-icon="inline-start" />
            Request review
          </a>
        </div>
      </div>
    </section>
  )
}
'''

text = replace_between(text, "function ReportReadyExperience(", "function DecisionCenterPanel(", report_ready)

decision_center_and_snapshot = r'''
function DecisionCenterPanel({ analysis, exportPath }: { analysis: AnalysisDetailType; exportPath: string }) {
  const decision = getDecisionIntelligence(analysis)
  const provider = analysis.enrichment?.provider ?? analysis.wallets.find((wallet) => wallet.enrichmentProvider)?.enrichmentProvider ?? "not recorded"
  const enrichedCount = analysis.enrichment?.enrichedCount ?? analysis.wallets.filter((wallet) => wallet.enrichmentStatus === "completed").length
  const failedCount = analysis.enrichment?.failedCount ?? analysis.wallets.filter((wallet) => wallet.enrichmentStatus === "failed").length
  const coverageRate = analysis.totalWallets ? Math.round((enrichedCount / analysis.totalWallets) * 100) : 0
  const highestRisk = [...analysis.wallets].sort((left, right) => right.riskScore - left.riskScore).slice(0, 3)
  const distributionState = decision.reviewWallets.length ? "Conditional" : "Ready"

  const operationalRows = [
    {
      label: "Distribution readiness",
      value: distributionState,
      detail: decision.reviewWallets.length
        ? `${formatNumber(decision.cleanWallets.length)} approved wallets are exportable; ${formatNumber(decision.reviewWallets.length)} remain withheld for human review.`
        : "No manual-review wallets remain before project confirmation.",
      tone: decision.reviewWallets.length ? "text-amber-200" : "text-green-200",
    },
    {
      label: "Human review",
      value: `${formatNumber(decision.reviewWallets.length)} pending`,
      detail: "Manual-review wallets remain outside the clean export until a reviewer records a final decision.",
      tone: "text-amber-200",
    },
    {
      label: "Evidence coverage",
      value: `${formatNumber(enrichedCount)}/${formatNumber(analysis.totalWallets)}`,
      detail: `${coverageRate}% provider coverage via ${provider}; ${formatNumber(failedCount)} provider retries required.`,
      tone: "text-primary",
    },
    {
      label: "Policy exclusions",
      value: formatNumber(decision.rejectedWallets.length),
      detail: "Excluded by deterministic eligibility/risk policy and retained with reason-code evidence.",
      tone: "text-red-200",
    },
  ]

  return (
    <Card className="glass-panel premium-card overflow-hidden">
      <CardHeader className="gap-4 border-b border-border lg:grid lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="text-primary" />
            Decision Center
          </CardTitle>
          <CardDescription>
            Operational readiness, human-review workload and evidence coverage without repeating the decision package.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`${exportPath}?type=approved`} className={`${buttonVariants()} glow-primary`}>
            <CheckCircle2 data-icon="inline-start" />
            Export clean list
          </a>
          <Link href={`/dashboard/analysis/${analysis.id}/review`} className={buttonVariants({ variant: "outline" })}>
            <Users data-icon="inline-start" />
            Review pending wallets
          </Link>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 p-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="overflow-hidden rounded-xl border border-border bg-background/35">
          {operationalRows.map((item, index) => (
            <div key={item.label} className={cn("grid gap-1 px-4 py-4 sm:grid-cols-[160px_120px_1fr] sm:items-center sm:gap-4", index > 0 && "border-t border-border")}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p className={cn("font-semibold", item.tone)}>{item.value}</p>
              <p className="text-sm leading-5 text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-background/35 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Evidence concentration</p>
              <Badge variant="outline">Top reason codes</Badge>
            </div>
            <div className="grid gap-2">
              {decision.topReasonCodes.length ? (
                decision.topReasonCodes.map((reason) => (
                  <div key={reason.code} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm">
                    <span className="min-w-0 break-all font-mono text-xs text-primary">{reason.code}</span>
                    <Badge variant="outline">{formatNumber(reason.count)}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No reason-code concentration found.</p>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background/35 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Highest risk observations</p>
              <Badge variant="outline">Deterministic score</Badge>
            </div>
            <div className="grid gap-2">
              {highestRisk.map((wallet) => (
                <div key={wallet.walletAddress} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm">
                  <span className="truncate font-mono text-xs text-muted-foreground">{wallet.walletAddress}</span>
                  <Badge variant="outline" className="border-red-400/30 text-red-200">{wallet.riskScore}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AnalysisSnapshotPanel({
  analysis,
  knownEntitiesCount,
  exchangeServiceWalletsCount,
}: {
  analysis: AnalysisDetailType
  knownEntitiesCount: number
  exchangeServiceWalletsCount: number
}) {
  const enrichedCount = analysis.enrichment?.enrichedCount ?? analysis.wallets.filter((wallet) => wallet.enrichmentStatus === "completed").length
  const coverageRate = analysis.totalWallets ? Math.round((enrichedCount / analysis.totalWallets) * 100) : 0
  const warningCount = analysis.enrichment?.warnings.length ?? 0
  const metrics = [
    ["Wallets evaluated", formatNumber(analysis.totalWallets), "Valid rows included in scoring."],
    ["Average risk", String(analysis.averageRiskScore), "Deterministic 0–100 risk score."],
    ["Graph clusters", formatNumber(analysis.suspiciousClustersCount), "Risk-relevant funding/behavior groups."],
    ["Known entities", formatNumber(knownEntitiesCount), `${formatNumber(exchangeServiceWalletsCount)} exchange/service entities.`],
    ["Provider coverage", `${coverageRate}%`, `${formatNumber(enrichedCount)}/${formatNumber(analysis.totalWallets)} wallets enriched.`],
    ["Evidence warnings", formatNumber(warningCount), warningCount ? "Provider or evidence caveats require attention." : "No provider warnings recorded."],
  ] as const

  return (
    <Card className="glass-panel premium-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Analysis Intelligence Snapshot</CardTitle>
        <CardDescription>Complementary evidence metrics; decision counts are kept in the decision package above.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map(([label, value, detail]) => (
          <div key={label} className="min-w-0 rounded-xl border border-border bg-background/35 p-3 sm:p-4">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">{value}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
'''

text = replace_between(text, "function DecisionCenterPanel(", "function PolicySimulator(", decision_center_and_snapshot)

metric_pattern = re.compile(
    r'      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">.*?'
    r'      <div className="grid gap-5 sm:grid-cols-3">.*?      </div>\r?\n\r?\n'
    r'(?=      <div className="grid gap-5 xl:grid-cols-\[1fr_1fr\]">)',
    re.S,
)
metric_replacement = block('''
      <AnalysisSnapshotPanel
        analysis={analysis}
        knownEntitiesCount={knownEntitiesCount}
        exchangeServiceWalletsCount={exchangeServiceWalletsCount}
      />

''')
text, metric_count = metric_pattern.subn(metric_replacement, text, count=1)
if metric_count != 1:
    raise SystemExit(f"expected one legacy metric block, replaced {metric_count}")

policy_and_proof_pattern = re.compile(
    r'      <div className="grid gap-5 xl:grid-cols-\[1fr_1fr\]">\s*'
    r'<Card className="glass-panel premium-card animated-border">\s*'
    r'<CardHeader>\s*<CardTitle>Campaign Decision Engine</CardTitle>.*?'
    r'<CardTitle>Clean List Proof</CardTitle>.*?</Card>\s*</div>\s*'
    r'(?=<Card className="glass-panel premium-card">\s*<CardHeader>\s*<CardTitle>Explainable Reason Codes</CardTitle>)',
    re.S,
)
policy_and_proof = block(r'''
      <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="glass-panel premium-card animated-border overflow-hidden">
          <CardHeader className="border-b border-border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Campaign Decision Engine</CardTitle>
                <CardDescription className="mt-1">
                  {campaignPolicy.label} for {campaignPolicy.scope}. The deterministic score is translated through a transparent 0–100 policy spectrum.
                </CardDescription>
              </div>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 capitalize text-primary">
                {analysis.riskPolicy ?? "balanced"} policy
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            <div>
              <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                <span>0</span>
                <span>Risk-policy spectrum</span>
                <span>100</span>
              </div>
              <div className="grid h-3 grid-cols-[36fr_24fr_40fr] overflow-hidden rounded-full border border-border bg-muted/30">
                <div className="bg-green-400/65" title="Automatic approval range" />
                <div className="bg-amber-400/65" title="Manual review range" />
                <div className="bg-red-400/65" title="Automatic exclusion range" />
              </div>
              <div className="mt-2 grid grid-cols-[36fr_24fr_40fr] text-[10px] font-medium">
                <span className="text-green-200">APPROVE</span>
                <span className="text-center text-amber-200">REVIEW</span>
                <span className="text-right text-red-200">EXCLUDE</span>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {campaignPolicy.rules.map((rule, index) => (
                <div
                  key={rule.label}
                  className={cn(
                    "rounded-xl border p-4",
                    index === 0
                      ? "border-green-400/25 bg-green-400/8"
                      : index === 1
                        ? "border-amber-400/25 bg-amber-400/8"
                        : "border-red-400/25 bg-red-400/8"
                  )}
                >
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rule.label}</p>
                  <p className={cn("mt-1 text-2xl font-semibold", index === 0 ? "text-green-200" : index === 1 ? "text-amber-200" : "text-red-200")}>{rule.value}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{rule.detail}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 text-xs leading-5 text-muted-foreground">
              Policy thresholds are decision rules, not proof of identity or malicious intent. Provider failures and unresolved evidence remain subject to manual review safeguards.
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card overflow-hidden">
          <CardHeader className="border-b border-border">
            <CardTitle className="flex items-center gap-2">
              <LockKeyhole className="text-primary" />
              Decision Proof
            </CardTitle>
            <CardDescription>
              Campaign-scoped evidence traceability for this decision set. This is not a global identity record or a cryptographic ownership claim.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-background/40 p-3 sm:col-span-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Proof ID</p>
                <p className="mt-1 break-all font-mono text-sm text-primary">{decisionIntelligence.proofId}</p>
              </div>
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Policy</p>
                <p className="mt-1 font-medium capitalize">{analysis.riskPolicy ?? "balanced"}</p>
              </div>
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Wallets evaluated</p>
                <p className="mt-1 font-medium">{formatNumber(analysis.totalWallets)}</p>
              </div>
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Generated</p>
                <p className="mt-1 text-sm font-medium">{formatDateTimeUTC(analysis.completedAt ?? analysis.createdAt)}</p>
              </div>
              <div className="rounded-lg border border-primary/25 bg-primary/8 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Evidence traceability</p>
                <p className="mt-1 font-medium text-primary">Active</p>
              </div>
            </div>

            <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-border bg-background/35">
              <div className="p-3 text-center">
                <p className="text-lg font-semibold text-green-200">{formatNumber(decisionIntelligence.cleanWallets.length)}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Approved</p>
              </div>
              <div className="border-x border-border p-3 text-center">
                <p className="text-lg font-semibold text-amber-200">{formatNumber(decisionIntelligence.reviewWallets.length)}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Manual review</p>
              </div>
              <div className="p-3 text-center">
                <p className="text-lg font-semibold text-red-200">{formatNumber(decisionIntelligence.rejectedWallets.length)}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Excluded</p>
              </div>
            </div>

            <p className="text-xs leading-5 text-muted-foreground">
              Reason codes, graph context and the campaign-scoped proof identifier are retained for explainable review. Evidence traceability does not establish common ownership, automation, Sybil behavior or malicious intent by itself.
            </p>
          </CardContent>
        </Card>
      </div>

''')
text, policy_count = policy_and_proof_pattern.subn(policy_and_proof, text, count=1)
if policy_count != 1:
    raise SystemExit(f"expected one policy/proof block, replaced {policy_count}")

# Standardize customer-facing terminology without changing backend status values.
replacements = {
    '{ value: "manual_review", label: "Gray Zone" }': '{ value: "manual_review", label: "Manual Review" }',
    'Export Gray Zone CSV': 'Export Manual Review CSV',
    'Export Rejected / Not Eligible CSV': 'Export Excluded / Not Eligible CSV',
    ' gray zone': ' manual review',
    'Gray Zone': 'Manual Review',
    'gray-zone': 'manual-review',
    '<span>Reject</span>': '<span>Exclude</span>',
}
for old, new in replacements.items():
    text = text.replace(old, new)

# These icons were used only by the removed oversized metric cards.
text = text.replace(f"  ShieldX,{eol}", "")
text = text.replace(f"  WalletCards,{eol}", "")

with path.open("w", encoding="utf-8", newline="") as handle:
    handle.write(text)

print("Decision workspace presentation updated")
