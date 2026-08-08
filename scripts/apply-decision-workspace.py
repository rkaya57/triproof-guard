from pathlib import Path

TARGET = Path("components/analysis/analysis-detail.tsx")
TEMPLATE_DIR = Path("scripts/decision-workspace")

with TARGET.open("r", encoding="utf-8", newline="") as handle:
    text = handle.read()

eol = "\r\n" if text.count("\r\n") > text.count("\n") // 2 else "\n"


def template(name: str) -> str:
    value = (TEMPLATE_DIR / name).read_text(encoding="utf-8").strip("\n")
    return value.replace("\n", eol)


def replace_between(value: str, start_marker: str, end_marker: str, replacement: str, start_at: int = 0) -> str:
    start = value.find(start_marker, start_at)
    if start < 0:
        raise SystemExit(f"start marker not found: {start_marker}")
    end = value.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"end marker not found: {end_marker}")
    return value[:start] + replacement + eol + eol + value[end:]


text = replace_between(
    text,
    "function ReportReadyExperience(",
    "function DecisionCenterPanel(",
    template("report-ready.txt"),
)
text = replace_between(
    text,
    "function DecisionCenterPanel(",
    "function PolicySimulator(",
    template("decision-center.txt"),
)

# Restrict all main-report replacements to the completed-analysis render, never the loading skeleton.
render_anchor = text.find("  const exportPath = exportBasePath ??")
if render_anchor < 0:
    raise SystemExit("completed-analysis render anchor not found")
main_return = text.find("  return (", render_anchor)
if main_return < 0:
    raise SystemExit("completed-analysis return not found")

metric_start_marker = '      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">'
campaign_start_marker = '      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">'
metric_start = text.find(metric_start_marker, main_return)
if metric_start < 0:
    raise SystemExit("main report metric block not found")
campaign_start = text.find(campaign_start_marker, metric_start)
if campaign_start < 0:
    raise SystemExit("campaign decision block not found")

snapshot = (
    '      <AnalysisSnapshotPanel' + eol
    + '        analysis={analysis}' + eol
    + '        knownEntitiesCount={knownEntitiesCount}' + eol
    + '        exchangeServiceWalletsCount={exchangeServiceWalletsCount}' + eol
    + '      />'
)
text = text[:metric_start] + snapshot + eol + eol + text[campaign_start:]

campaign_start = text.find(campaign_start_marker, main_return)
explainable_title = text.find("<CardTitle>Explainable Reason Codes</CardTitle>", campaign_start)
if explainable_title < 0:
    raise SystemExit("Explainable Reason Codes title not found")
explainable_start = text.rfind(
    '<Card className="glass-panel premium-card">',
    campaign_start,
    explainable_title,
)
if explainable_start < 0:
    raise SystemExit("Explainable Reason Codes card start not found")
text = text[:campaign_start] + template("policy-proof.txt") + eol + eol + text[explainable_start:]

# Standardize report terminology while leaving backend status values unchanged.
for old, new in {
    '{ value: "manual_review", label: "Gray Zone" }': '{ value: "manual_review", label: "Manual Review" }',
    'Export Gray Zone CSV': 'Export Manual Review CSV',
    'Export Rejected / Not Eligible CSV': 'Export Excluded / Not Eligible CSV',
    ' gray zone': ' manual review',
    'Gray Zone': 'Manual Review',
    'gray-zone': 'manual-review',
    '<span>Reject</span>': '<span>Exclude</span>',
}.items():
    text = text.replace(old, new)

# Remove imports used only by the replaced oversized metric cards.
text = text.replace(f"  ShieldX,{eol}", "")
text = text.replace(f"  WalletCards,{eol}", "")

required = [
    "Campaign decision package is ready.",
    "Analysis Intelligence Snapshot",
    "Distribution readiness",
    "Policy exclusions",
    "Risk-policy spectrum",
    "Decision Proof",
    "Evidence traceability",
    "Manual Review",
]
for marker in required:
    if marker not in text:
        raise SystemExit(f"required presentation marker missing: {marker}")

for forbidden in ["Risk contained", "Clean List Proof", 'title="Total wallets"', 'title="Gray Zone"']:
    if forbidden in text:
        raise SystemExit(f"legacy presentation marker still present: {forbidden}")

with TARGET.open("w", encoding="utf-8", newline="") as handle:
    handle.write(text)

print("Decision workspace transformation completed and validated")
