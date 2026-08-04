from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {count}: {old[:120]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


def write(path: str, content: str) -> None:
    file_path = ROOT / path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding="utf-8")


replace_once(
    "prisma/schema.prisma",
    "  description   String              @db.Text\n  type          AirdropTaskType",
    "  description   String              @db.Text\n  targetUrl     String?             @db.Text\n  type          AirdropTaskType",
)

write(
    "prisma/migrations/20260804210000_airdrop_task_target_url/migration.sql",
    '''ALTER TABLE "AirdropTask" ADD COLUMN IF NOT EXISTS "targetUrl" TEXT;

UPDATE "AirdropTask"
SET "targetUrl" = 'https://x.com/TriProof_'
WHERE "slug" IN ('x-follow-triproof', 'x-quote-triproof-post')
  AND "targetUrl" IS NULL;

UPDATE "AirdropTask"
SET "targetUrl" = 'https://t.me/+MuFX4GKruRU1YTRk'
WHERE "slug" = 'join-triproof-telegram'
  AND "targetUrl" IS NULL;
''',
)

replace_once(
    "lib/airdrop/tasks.ts",
    "  description: string\n  type: AirdropTaskType",
    "  description: string\n  targetUrl: string | null\n  type: AirdropTaskType",
)

for marker, target in [
    (
        '      "Follow the official Tri-Proof Protocol X account at https://x.com/TriProof_ and submit a screenshot as proof.",\n    type: "X_FOLLOW",',
        '      "Follow the official Tri-Proof Protocol X account at https://x.com/TriProof_ and submit a screenshot as proof.",\n    targetUrl: TRIPROOF_X_URL,\n    type: "X_FOLLOW",',
    ),
    (
        '      "Quote-share any post from the official Tri-Proof Protocol X account and submit the quote URL plus screenshot evidence.",\n    type: "X_QUOTE",',
        '      "Quote-share any post from the official Tri-Proof Protocol X account and submit the quote URL plus screenshot evidence.",\n    targetUrl: TRIPROOF_X_URL,\n    type: "X_QUOTE",',
    ),
    (
        '      "Join the official Tri-Proof Protocol Telegram group at https://t.me/+MuFX4GKruRU1YTRk and submit a screenshot that clearly shows your membership.",\n    type: "TELEGRAM_JOIN",',
        '      "Join the official Tri-Proof Protocol Telegram group at https://t.me/+MuFX4GKruRU1YTRk and submit a screenshot that clearly shows your membership.",\n    targetUrl: TRIPROOF_TELEGRAM_URL,\n    type: "TELEGRAM_JOIN",',
    ),
    (
        '      "Submit one evidence-backed scam report to the Threat Pool. If an admin verifies and publishes it, you earn 150 points once per UTC day.",\n    type: "THREAT_REPORT",',
        '      "Submit one evidence-backed scam report to the Threat Pool. If an admin verifies and publishes it, you earn 150 points once per UTC day.",\n    targetUrl: null,\n    type: "THREAT_REPORT",',
    ),
    (
        '      "Run the one-time ScamGuard Solana readiness test, then submit feedback and optional screenshot evidence for admin review.",\n    type: "HUMANITY_GATE_FEEDBACK",',
        '      "Run the one-time ScamGuard Solana readiness test, then submit feedback and optional screenshot evidence for admin review.",\n    targetUrl: null,\n    type: "HUMANITY_GATE_FEEDBACK",',
    ),
]:
    replace_once("lib/airdrop/tasks.ts", marker, target)

replace_once(
    "lib/airdrop/tasks.ts",
    '''export async function ensureAirdropTasks(dbClient: AirdropTaskClient | AirdropTaskTransaction) {
  const activeSlugs = AIRDROP_TASK_DEFINITIONS.map((task) => task.slug)

  await Promise.all(
    AIRDROP_TASK_DEFINITIONS.map((task) =>
      dbClient.airdropTask.upsert({
        where: { slug: task.slug },
        update: {
          title: task.title,
          description: task.description,
          type: task.type,
          points: task.points,
          proofRequired: task.proofRequired,
          active: true,
          sortOrder: task.sortOrder,
        },
        create: {
          slug: task.slug,
          title: task.title,
          description: task.description,
          type: task.type,
          points: task.points,
          proofRequired: task.proofRequired,
          active: true,
          sortOrder: task.sortOrder,
        },
      })
    )
  )

  await dbClient.airdropTask.updateMany({
    where: {
      active: true,
      slug: { notIn: activeSlugs },
    },
    data: { active: false },
  })
}
''',
    '''export async function ensureAirdropTasks(dbClient: AirdropTaskClient | AirdropTaskTransaction) {
  await Promise.all(
    AIRDROP_TASK_DEFINITIONS.map((task) =>
      dbClient.airdropTask.upsert({
        where: { slug: task.slug },
        update: {},
        create: {
          slug: task.slug,
          title: task.title,
          description: task.description,
          targetUrl: task.targetUrl,
          type: task.type,
          points: task.points,
          proofRequired: task.proofRequired,
          active: true,
          sortOrder: task.sortOrder,
        },
      })
    )
  )
}
''',
)

replace_once(
    "lib/airdrop/tasks.ts",
    '''export function isAirdropSchemaMissing(error: unknown) {''',
    '''export function isXUrl(value: string) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase().replace(/^www\\./, "")
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      (hostname === "x.com" || hostname === "twitter.com")
    )
  } catch {
    return false
  }
}

export function isSubmissionLocked(status: string | null | undefined) {
  return status === "PENDING" || status === "APPROVED"
}

export function isAirdropSchemaMissing(error: unknown) {''',
)

write(
    "lib/airdrop/tasks.test.ts",
    '''import assert from "node:assert/strict"
import test from "node:test"

import { isLikelyUrl, isSubmissionLocked, isXUrl } from "./tasks"

test("task target URLs only accept http and https", () => {
  assert.equal(isLikelyUrl("https://x.com/TriProof_"), true)
  assert.equal(isLikelyUrl("javascript:alert(1)"), false)
  assert.equal(isLikelyUrl("not-a-url"), false)
})

test("X quote targets must use an X or Twitter hostname", () => {
  assert.equal(isXUrl("https://x.com/TriProof_/status/123"), true)
  assert.equal(isXUrl("https://twitter.com/TriProof_/status/123"), true)
  assert.equal(isXUrl("https://example.com/?next=x.com"), false)
})

test("pending and approved submissions cannot be submitted again", () => {
  assert.equal(isSubmissionLocked("PENDING"), true)
  assert.equal(isSubmissionLocked("APPROVED"), true)
  assert.equal(isSubmissionLocked("REJECTED"), false)
  assert.equal(isSubmissionLocked(null), false)
})
''',
)

replace_once(
    "package.json",
    '    "test:policies": "node --import tsx --test lib/team-policy/engine.test.ts",\n',
    '    "test:policies": "node --import tsx --test lib/team-policy/engine.test.ts",\n    "test:airdrop": "node --import tsx --test lib/airdrop/tasks.test.ts",\n',
)

replace_once(
    "app/api/admin/airdrop/tasks/route.ts",
    '''  ensureAirdropTasks,
  isAirdropSchemaMissing,
} from "@/lib/airdrop/tasks"''',
    '''  ensureAirdropTasks,
  isAirdropSchemaMissing,
  isLikelyUrl,
  isXUrl,
} from "@/lib/airdrop/tasks"''',
)
replace_once(
    "app/api/admin/airdrop/tasks/route.ts",
    '''    description?: string
    type?: AirdropTaskType''',
    '''    description?: string
    targetUrl?: string
    type?: AirdropTaskType''',
)
replace_once(
    "app/api/admin/airdrop/tasks/route.ts",
    '''  const description = input?.description?.trim() ?? ""
  const type = input?.type''',
    '''  const description = input?.description?.trim() ?? ""
  const targetUrl = input?.targetUrl?.trim() || null
  const type = input?.type''',
)
replace_once(
    "app/api/admin/airdrop/tasks/route.ts",
    '''  if (!type || !AIRDROP_TASK_TYPES.includes(type)) return { error: "Select a valid task type." }
  if (!Number.isInteger(points) || points <= 0 || points > 100000) {''',
    '''  if (!type || !AIRDROP_TASK_TYPES.includes(type)) return { error: "Select a valid task type." }
  if (targetUrl && (targetUrl.length > 2048 || !isLikelyUrl(targetUrl))) {
    return { error: "Task link must be a valid http or https URL." }
  }
  if (type === "X_QUOTE" && (!targetUrl || !isXUrl(targetUrl))) {
    return { error: "X quote tasks require a valid X post or profile link." }
  }
  if (!Number.isInteger(points) || points <= 0 || points > 100000) {''',
)
replace_once(
    "app/api/admin/airdrop/tasks/route.ts",
    '''      description,
      type,''',
    '''      description,
      targetUrl,
      type,''',
)
replace_once(
    "app/api/admin/airdrop/tasks/route.ts",
    '''        description: task.description,
        type: task.type,''',
    '''        description: task.description,
        targetUrl: task.targetUrl,
        type: task.type,''',
)

replace_once(
    "components/admin/airdrop-review-console.tsx",
    'type TaskType = "X_FOLLOW" | "X_QUOTE" | "TELEGRAM_JOIN" | "HUMANITY_GATE_FEEDBACK"',
    'type TaskType = "X_FOLLOW" | "X_QUOTE" | "TELEGRAM_JOIN" | "THREAT_REPORT" | "HUMANITY_GATE_FEEDBACK"',
)
replace_once(
    "components/admin/airdrop-review-console.tsx",
    '''  description: string
  type: TaskType''',
    '''  description: string
  targetUrl: string | null
  type: TaskType''',
)
replace_once(
    "components/admin/airdrop-review-console.tsx",
    '''  description: "",
  type: "X_FOLLOW" as TaskType,''',
    '''  description: "",
  targetUrl: "",
  type: "X_FOLLOW" as TaskType,''',
)
replace_once(
    "components/admin/airdrop-review-console.tsx",
    '''      description: task.description,
      type: task.type,''',
    '''      description: task.description,
      targetUrl: task.targetUrl ?? "",
      type: task.type,''',
)
replace_once(
    "components/admin/airdrop-review-console.tsx",
    '''            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-2 text-sm text-slate-300">''',
    '''            <label className="grid gap-2 text-sm text-slate-300">
              Task link {taskForm.type === "X_QUOTE" ? "(required)" : "(optional)"}
              <Input
                type="url"
                value={taskForm.targetUrl}
                onChange={(event) => setTaskForm((current) => ({ ...current, targetUrl: event.target.value }))}
                placeholder="https://x.com/TriProof_/status/..."
                required={taskForm.type === "X_QUOTE"}
              />
              <span className="text-xs leading-5 text-slate-400">
                Paste the exact post, profile, Telegram, or campaign URL users must open before submitting proof.
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-2 text-sm text-slate-300">''',
)
replace_once(
    "components/admin/airdrop-review-console.tsx",
    '''                  <option value="TELEGRAM_JOIN">Telegram join</option>
                  <option value="HUMANITY_GATE_FEEDBACK">ScamGuard feedback</option>''',
    '''                  <option value="TELEGRAM_JOIN">Telegram join</option>
                  <option value="THREAT_REPORT">Threat report</option>
                  <option value="HUMANITY_GATE_FEEDBACK">ScamGuard feedback</option>''',
)
replace_once(
    "components/admin/airdrop-review-console.tsx",
    '''                    <p className="text-sm leading-6 text-slate-300">{task.description}</p>
                    <p className="mt-2 font-mono text-xs text-slate-400">''',
    '''                    <p className="text-sm leading-6 text-slate-300">{task.description}</p>
                    {task.targetUrl && (
                      <a
                        href={task.targetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Open task link <ExternalLink className="size-3" />
                      </a>
                    )}
                    <p className="mt-2 font-mono text-xs text-slate-400">''',
)

replace_once(
    "app/api/airdrop/me/route.ts",
    '''          description: task.description,
          type: task.type,''',
    '''          description: task.description,
          targetUrl: task.targetUrl,
          type: task.type,''',
)

replace_once(
    "components/airdrop/airdrop-tasks-client.tsx",
    '''  description: string
  type: TaskType''',
    '''  description: string
  targetUrl: string | null
  type: TaskType''',
)
replace_once(
    "components/airdrop/airdrop-tasks-client.tsx",
    '''<a href={triproofXUrl} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "outline" })} w-full text-white`}>
                    Follow @TriProof_''',
    '''<a href={task.targetUrl ?? triproofXUrl} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "outline" })} w-full text-white`}>
                    Follow @TriProof_''',
)
replace_once(
    "components/airdrop/airdrop-tasks-client.tsx",
    '''<a href={quoteSearchUrl} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "outline" })} w-full text-white`}>
                    Open Tri-Proof posts''',
    '''<a href={task.targetUrl ?? quoteSearchUrl} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "outline" })} w-full text-white`}>
                    Open post to quote''',
)
replace_once(
    "components/airdrop/airdrop-tasks-client.tsx",
    '''<a href={triproofTelegramUrl} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "outline" })} w-full text-white`}>
                    Join Tri-Proof Telegram''',
    '''<a href={task.targetUrl ?? triproofTelegramUrl} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "outline" })} w-full text-white`}>
                    Join Tri-Proof Telegram''',
)
replace_once(
    "components/airdrop/airdrop-tasks-client.tsx",
    '''                {threatPoolTask && (
                  <div className="space-y-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-slate-200">''',
    '''                {task.targetUrl && !["X_FOLLOW", "X_QUOTE", "TELEGRAM_JOIN"].includes(task.type) && (
                  <a href={task.targetUrl} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "outline" })} w-full text-white`}>
                    Open task link <ExternalLink data-icon="inline-end" />
                  </a>
                )}

                {threatPoolTask && (
                  <div className="space-y-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-slate-200">''',
)

replace_once(
    "app/api/airdrop/submissions/route.ts",
    '''  ensureAirdropTasks,
  isLikelyUrl,
  isValidEvidenceImage,''',
    '''  ensureAirdropTasks,
  isLikelyUrl,
  isSubmissionLocked,
  isValidEvidenceImage,''',
)
replace_once(
    "app/api/airdrop/submissions/route.ts",
    '''  if (current?.status === "APPROVED") {
    return NextResponse.json({ error: "This task is already approved." }, { status: 409 })
  }''',
    '''  if (isSubmissionLocked(current?.status)) {
    const error =
      current?.status === "APPROVED"
        ? "This task is already approved and cannot earn points again."
        : "This task already has a submission pending review."
    return NextResponse.json({ error }, { status: 409 })
  }''',
)

print("Airdrop task link and repeat-submission protections applied.")
