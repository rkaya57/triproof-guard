from pathlib import Path

path = Path("components/analysis/analysis-detail.tsx")
with path.open("r", encoding="utf-8", newline="") as handle:
    text = handle.read()

text = text.replace(
    "Human-readable evidence is normalized into compact codes for API responses, clean-list exports and Manual Review review.",
    "Human-readable evidence is normalized into compact codes for API responses, clean-list exports and manual-review workflows.",
)
text = text.replace(
    '\n<Card className="glass-panel premium-card">\n        <CardHeader>\n          <CardTitle>Explainable Reason Codes</CardTitle>',
    '\n      <Card className="glass-panel premium-card">\n        <CardHeader>\n          <CardTitle>Explainable Reason Codes</CardTitle>',
)
text = text.replace(
    '\r\n<Card className="glass-panel premium-card">\r\n        <CardHeader>\r\n          <CardTitle>Explainable Reason Codes</CardTitle>',
    '\r\n      <Card className="glass-panel premium-card">\r\n        <CardHeader>\r\n          <CardTitle>Explainable Reason Codes</CardTitle>',
)

if "Manual Review review" in text:
    raise SystemExit("duplicate review wording remains")
if "manual-review workflows" not in text:
    raise SystemExit("expected polished review copy missing")

with path.open("w", encoding="utf-8", newline="") as handle:
    handle.write(text)

print("Decision workspace copy finalized")
