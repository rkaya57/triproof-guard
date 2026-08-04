"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { Archive, CheckCircle2, ChevronRight, ClipboardCheck, FileDown, FilePlus2, FileText, Inbox, Loader2, Send, ShieldCheck, UserRoundCheck, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type Approval = { id: string; sequence: number; role: "PARAPH" | "CONTROL" | "APPROVE"; status: "PENDING" | "APPROVED" | "REJECTED"; approverName: string | null; approverEmail: string; note: string | null; actedAt: string | null }
type Recipient = { id: string; kind: "ACTION" | "INFO"; recipientName: string; recipientEmail: string | null; deliveredAt: string | null; readAt: string | null }
type Audit = { id: string; actorName: string; event: string; detail: string | null; createdAt: string }
type DocumentItem = { id: string; documentNumber: string | null; type: string; status: string; unit: string; subject: string; recipient: string; reference: string | null; body: string; createdAt: string; updatedAt: string; submittedAt: string | null; approvedAt: string | null; sentAt: string | null; authorId: string; author: { name: string; email: string }; approvals: Approval[]; recipients: Recipient[]; audits: Audit[] }

const typeOptions = [
  ["OFFICIAL_LETTER", "Official letter"],
  ["DECISION", "Decision / approval"],
  ["MEMO", "Internal memo"],
  ["MINUTES", "Meeting minutes"],
  ["REPORT", "Report"],
] as const

const roleOptions = [["PARAPH", "Paraph"], ["CONTROL", "Control"], ["APPROVE", "Approval"]] as const

const statusLabel: Record<string, string> = { DRAFT: "Draft", IN_REVIEW: "In review", APPROVED: "Approved", REJECTED: "Returned", SENT: "Distributed", ARCHIVED: "Archived" }

function statusTone(status: string) {
  if (status === "APPROVED" || status === "SENT") return "border-green-400/35 bg-green-400/10 text-green-100"
  if (status === "REJECTED") return "border-red-400/35 bg-red-400/10 text-red-100"
  if (status === "IN_REVIEW") return "border-yellow-400/35 bg-yellow-400/10 text-yellow-100"
  return "border-primary/35 bg-primary/10 text-primary"
}

function textForType(value: string, values: ReadonlyArray<readonly [string, string]>) {
  return values.find(([key]) => key === value)?.[1] ?? value.replaceAll("_", " ")
}

export function TriProofNetConsole({ currentUser }: { currentUser: { id: string; name: string; email: string } }) {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [showComposer, setShowComposer] = useState(false)
  const [tab, setTab] = useState<"workspace" | "inbox" | "approvals">("workspace")
  const [form, setForm] = useState({
    type: "OFFICIAL_LETTER",
    unit: "Tri-Proof Protocol",
    subject: "",
    recipient: "",
    reference: "",
    body: "",
    deadlineAt: "",
    attachments: "",
    approvals: [{ role: "PARAPH", email: "", name: "" }],
    recipients: [{ kind: "ACTION", name: "", email: "" }],
  })

  async function refresh() {
    setLoading(true)
    try {
      const response = await fetch("/api/net/documents", { cache: "no-store" })
      const payload = (await response.json().catch(() => ({}))) as { documents?: DocumentItem[]; error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Tri Proof Net could not load documents.")
      setDocuments(payload.documents ?? [])
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Tri Proof Net could not load documents.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void fetch("/api/net/documents", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { documents?: DocumentItem[]; error?: string }
        if (!response.ok) throw new Error(payload.error ?? "Tri Proof Net could not load documents.")
        if (active) setDocuments(payload.documents ?? [])
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Tri Proof Net could not load documents.")
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const mine = useMemo(() => documents.filter((document) => document.authorId === currentUser.id), [documents, currentUser.id])
  const incoming = useMemo(() => documents.filter((document) => document.authorId !== currentUser.id && document.recipients.some((recipient) => recipient.recipientEmail?.toLowerCase() === currentUser.email.toLowerCase())), [documents, currentUser])
  const pendingApprovals = useMemo(() => documents.filter((document) => document.status === "IN_REVIEW" && document.approvals.find((step) => step.status === "PENDING")?.approverEmail.toLowerCase() === currentUser.email.toLowerCase()), [documents, currentUser.email])
  const draftCount = mine.filter((document) => ["DRAFT", "REJECTED"].includes(document.status)).length

  async function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true); setError(""); setNotice("")
    try {
      const response = await fetch("/api/net/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          deadlineAt: form.deadlineAt ? new Date(form.deadlineAt).toISOString() : null,
          attachments: form.attachments.split("\n").map((item) => item.trim()).filter(Boolean),
          approvals: form.approvals.filter((step) => step.email.trim()).map((step) => ({ ...step, email: step.email.trim(), name: step.name.trim() || null })),
          recipients: form.recipients.filter((recipient) => recipient.name.trim()).map((recipient) => ({ ...recipient, name: recipient.name.trim(), email: recipient.email.trim() || null })),
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Document could not be created.")
      setNotice("Draft saved. Review the approval chain, then send it into the workflow.")
      setShowComposer(false)
      setForm({ type: "OFFICIAL_LETTER", unit: "Tri-Proof Protocol", subject: "", recipient: "", reference: "", body: "", deadlineAt: "", attachments: "", approvals: [{ role: "PARAPH", email: "", name: "" }], recipients: [{ kind: "ACTION", name: "", email: "" }] })
      await refresh()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Document could not be created.")
    } finally { setSaving(false) }
  }

  async function runAction(id: string, action: "SUBMIT" | "APPROVE" | "REJECT" | "SEND" | "ARCHIVE" | "MARK_READ") {
    setSaving(true); setError(""); setNotice("")
    const note = ["APPROVE", "REJECT"].includes(action) ? window.prompt(action === "REJECT" ? "Return note (required for a useful revision):" : "Optional approval note:") : null
    if (action === "REJECT" && !note?.trim()) { setSaving(false); return }
    try {
      const response = await fetch(`/api/net/documents/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, note }) })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Document action could not be completed.")
      setNotice(({ SUBMIT: "Document sent into its approval chain.", APPROVE: "Approval recorded.", REJECT: "Document returned to its author.", SEND: "Document distributed to its internal recipients.", ARCHIVE: "Document archived.", MARK_READ: "Receipt recorded." } as Record<string, string>)[action])
      await refresh()
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Document action could not be completed.") } finally { setSaving(false) }
  }

  const visible = tab === "workspace" ? mine : tab === "inbox" ? incoming : pendingApprovals

  return <div className="grid gap-7">
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="glass-panel border-primary/30 bg-primary/5">
        <CardHeader className="gap-4">
          <Badge variant="outline" className="w-fit border-primary/35 bg-primary/10 text-primary"><FileText /> TRI PROOF NET</Badge>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><CardTitle className="text-3xl">Internal document office</CardTitle><CardDescription className="mt-2 max-w-2xl text-base leading-7">Prepare formal team documents, route them through paraph, control and approval steps, distribute them to colleagues, and export a traceable PDF.</CardDescription></div><Button onClick={() => setShowComposer((value) => !value)}><FilePlus2 /> {showComposer ? "Close composer" : "New document"}</Button></div>
        </CardHeader>
      </Card>
      <Card className="border-yellow-400/25 bg-yellow-400/5"><CardHeader><ShieldCheck className="size-6 text-yellow-300" /><CardTitle className="text-lg">Compliance boundary</CardTitle><CardDescription>Tri Proof Net records internal approvals. It is not a qualified e-signature, e-Yazisma package, or public-institution dispatch service.</CardDescription></CardHeader></Card>
    </section>

    {showComposer && <Card className="border-primary/30 bg-card/80"><CardHeader><CardTitle>Prepare an official document</CardTitle><CardDescription>Document number is assigned after the final internal approval. Keep sensitive files out of attachment names and add files through your approved team storage.</CardDescription></CardHeader><CardContent><form onSubmit={createDocument} className="grid gap-5"><div className="grid gap-4 md:grid-cols-2"><Field label="Document type"><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">{typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Unit / department"><Input required value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></Field></div><div className="grid gap-4 md:grid-cols-2"><Field label="Subject"><Input required minLength={4} value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Subject of the document" /></Field><Field label="Recipient / addressee"><Input required value={form.recipient} onChange={(event) => setForm({ ...form, recipient: event.target.value })} placeholder="Team, company or individual" /></Field></div><div className="grid gap-4 md:grid-cols-2"><Field label="Reference (optional)"><Input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder="Related document, meeting or decision" /></Field><Field label="Deadline (optional)"><Input type="datetime-local" value={form.deadlineAt} onChange={(event) => setForm({ ...form, deadlineAt: event.target.value })} /></Field></div><Field label="Document body"><Textarea required minLength={20} className="min-h-52 font-serif text-base leading-7" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="Write the document content. Paragraphs are preserved in the generated PDF." /></Field><Field label="Attachments (one file title per line, optional)"><Textarea value={form.attachments} onChange={(event) => setForm({ ...form, attachments: event.target.value })} placeholder="Example: Q3 security review.pdf" /></Field><WorkflowEditor approvals={form.approvals} onChange={(approvals) => setForm({ ...form, approvals })} /><RecipientEditor recipients={form.recipients} onChange={(recipients) => setForm({ ...form, recipients })} />{error && <p className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</p>}<Button type="submit" disabled={saving} className="w-fit">{saving ? <Loader2 className="animate-spin" /> : <FilePlus2 />} Save draft</Button></form></CardContent></Card>}

    {(notice || error) && <p className={`rounded-lg border p-3 text-sm ${error ? "border-red-400/30 bg-red-400/10 text-red-100" : "border-green-400/30 bg-green-400/10 text-green-100"}`}>{error || notice}</p>}
    <section className="grid gap-4 sm:grid-cols-3"><Metric icon={FileText} label="My drafts" value={draftCount} /><Metric icon={ClipboardCheck} label="Pending approvals" value={pendingApprovals.length} /><Metric icon={Inbox} label="Incoming documents" value={incoming.length} /></section>
    <section><div className="mb-4 flex flex-wrap gap-2">{([ ["workspace", "My documents", FileText], ["approvals", "My approvals", UserRoundCheck], ["inbox", "Incoming", Inbox] ] as const).map(([value, label, Icon]) => <Button key={value} size="sm" variant={tab === value ? "default" : "outline"} onClick={() => setTab(value)}><Icon /> {label}</Button>)}</div>{loading ? <div className="flex items-center gap-2 rounded-lg border border-border p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading document register…</div> : <div className="grid gap-4">{visible.map((document) => <DocumentCard key={document.id} document={document} currentUser={currentUser} busy={saving} onAction={runAction} />)}{!visible.length && <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center text-sm text-muted-foreground"><FileText className="mx-auto mb-3 size-6 text-primary" />No documents in this view yet.</div>}</div>}</section>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-2 text-sm font-medium">{label}{children}</label> }
function Metric({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: number }) { return <Card className="premium-card"><CardContent className="flex items-center gap-4 p-5"><span className="flex size-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary"><Icon /></span><div><p className="text-2xl font-semibold">{value}</p><p className="text-sm text-muted-foreground">{label}</p></div></CardContent></Card> }

function WorkflowEditor({ approvals, onChange }: { approvals: { role: string; email: string; name: string }[]; onChange: (value: { role: string; email: string; name: string }[]) => void }) { return <section className="rounded-lg border border-border bg-muted/20 p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Approval flow</h3><p className="text-sm text-muted-foreground">Route in order: paraph, control, then final approval. The email must match the team member’s Tri-Proof account.</p></div><Button type="button" size="sm" variant="outline" onClick={() => onChange([...approvals, { role: "APPROVE", email: "", name: "" }])}>Add step</Button></div><div className="grid gap-3">{approvals.map((step, index) => <div className="grid gap-2 md:grid-cols-[9rem_1fr_1fr_auto]" key={index}><select value={step.role} onChange={(event) => onChange(approvals.map((item, position) => position === index ? { ...item, role: event.target.value } : item))} className="h-10 rounded-md border border-input bg-background px-3 text-sm">{roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Input required value={step.name} onChange={(event) => onChange(approvals.map((item, position) => position === index ? { ...item, name: event.target.value } : item))} placeholder="Name" /><Input required type="email" value={step.email} onChange={(event) => onChange(approvals.map((item, position) => position === index ? { ...item, email: event.target.value } : item))} placeholder="team@triproofprotocol.com" /><Button type="button" variant="ghost" size="icon" disabled={approvals.length === 1} onClick={() => onChange(approvals.filter((_, position) => position !== index))} aria-label="Remove approval step"><XCircle /></Button></div>)}</div></section> }
function RecipientEditor({ recipients, onChange }: { recipients: { kind: string; name: string; email: string }[]; onChange: (value: { kind: string; name: string; email: string }[]) => void }) { return <section className="rounded-lg border border-border bg-muted/20 p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Distribution</h3><p className="text-sm text-muted-foreground">Use “For action” for an accountable recipient and “For information” for copied team members.</p></div><Button type="button" size="sm" variant="outline" onClick={() => onChange([...recipients, { kind: "INFO", name: "", email: "" }])}>Add recipient</Button></div><div className="grid gap-3">{recipients.map((recipient, index) => <div className="grid gap-2 md:grid-cols-[9rem_1fr_1fr_auto]" key={index}><select value={recipient.kind} onChange={(event) => onChange(recipients.map((item, position) => position === index ? { ...item, kind: event.target.value } : item))} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="ACTION">For action</option><option value="INFO">For information</option></select><Input value={recipient.name} onChange={(event) => onChange(recipients.map((item, position) => position === index ? { ...item, name: event.target.value } : item))} placeholder="Name or team" /><Input type="email" value={recipient.email} onChange={(event) => onChange(recipients.map((item, position) => position === index ? { ...item, email: event.target.value } : item))} placeholder="Optional Tri-Proof email" /><Button type="button" variant="ghost" size="icon" disabled={recipients.length === 1} onClick={() => onChange(recipients.filter((_, position) => position !== index))} aria-label="Remove recipient"><XCircle /></Button></div>)}</div></section> }

function DocumentCard({ document, currentUser, busy, onAction }: { document: DocumentItem; currentUser: { id: string; name: string; email: string }; busy: boolean; onAction: (id: string, action: "SUBMIT" | "APPROVE" | "REJECT" | "SEND" | "ARCHIVE" | "MARK_READ") => void }) {
  const isAuthor = document.authorId === currentUser.id
  const nextStep = document.approvals.find((step) => step.status === "PENDING")
  const isAssignee = nextStep?.approverEmail.toLowerCase() === currentUser.email.toLowerCase()
  const isRecipient = document.recipients.some((recipient) => recipient.recipientEmail?.toLowerCase() === currentUser.email.toLowerCase())
  return <Card className="premium-card overflow-hidden"><CardHeader className="gap-3"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={statusTone(document.status)}>{statusLabel[document.status]}</Badge><Badge variant="outline">{textForType(document.type, typeOptions)}</Badge>{document.documentNumber && <span className="font-mono text-xs text-primary">{document.documentNumber}</span>}</div><span className="text-xs text-muted-foreground">Updated {new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(document.updatedAt))}</span></div><CardTitle className="text-xl">{document.subject}</CardTitle><CardDescription>To: {document.recipient} · Prepared by {document.author.name}</CardDescription></CardHeader><CardContent className="grid gap-4"><p className="line-clamp-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{document.body}</p><div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-4 lg:grid-cols-[1fr_auto]"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Workflow</p><div className="mt-2 flex flex-wrap gap-2">{document.approvals.map((step) => <span key={step.id} className={`rounded border px-2 py-1 text-xs ${step.status === "APPROVED" ? "border-green-400/30 bg-green-400/10 text-green-100" : step.status === "REJECTED" ? "border-red-400/30 bg-red-400/10 text-red-100" : "border-border text-muted-foreground"}`}>{step.sequence}. {textForType(step.role, roleOptions)} · {step.approverName || step.approverEmail}</span>)}</div>{nextStep && <p className="mt-3 text-sm text-muted-foreground">Awaiting: <span className="font-medium text-foreground">{nextStep.approverName || nextStep.approverEmail}</span></p>}</div><div className="flex flex-wrap items-center gap-2 lg:justify-end"><Button size="sm" variant="outline" onClick={() => window.open(`/api/net/documents/${document.id}/pdf`, "_blank", "noopener,noreferrer")}><FileDown /> PDF</Button>{isAuthor && ["DRAFT", "REJECTED"].includes(document.status) && <Button size="sm" disabled={busy} onClick={() => onAction(document.id, "SUBMIT")}><Send /> Submit</Button>}{isAssignee && <><Button size="sm" disabled={busy} onClick={() => onAction(document.id, "APPROVE")}><CheckCircle2 /> Approve</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => onAction(document.id, "REJECT")}><XCircle /> Return</Button></>}{isAuthor && document.status === "APPROVED" && <Button size="sm" disabled={busy} onClick={() => onAction(document.id, "SEND")}><Send /> Distribute</Button>}{isAuthor && ["APPROVED", "SENT"].includes(document.status) && <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction(document.id, "ARCHIVE")}><Archive /> Archive</Button>}{isRecipient && document.status === "SENT" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction(document.id, "MARK_READ")}><Inbox /> Mark read</Button>}</div></div><details className="rounded-lg border border-border px-4 py-3"><summary className="cursor-pointer text-sm font-medium">Document register and audit trail</summary><div className="mt-4 grid gap-3 text-sm">{document.audits.map((audit) => <div className="flex gap-3" key={audit.id}><ChevronRight className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="font-medium">{audit.event.replaceAll("_", " ")} · {audit.actorName}</p><p className="text-muted-foreground">{audit.detail || "No note"} · {new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(audit.createdAt))}</p></div></div>)}</div></details></CardContent></Card>
}
