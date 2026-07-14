import Link from "next/link"
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Crown,
  Flame,
  Gift,
  GitBranch,
  LockKeyhole,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
  WalletCards,
  Zap,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

const seasonStats = [
  ["Season points", "0", "Quest ledger opens soon"],
  ["Live task pool", "12", "Across wallet, community and product work"],
  ["Trust multiplier", "1.0x", "Humanity and wallet signals will increase quality"],
  ["Sybil shield", "Active", "Low-quality farming will be filtered"],
]

const questTracks = [
  {
    icon: WalletCards,
    title: "Wallet Proof",
    summary: "Connect campaign wallets, keep activity clean and prove ownership without exposing private keys.",
    points: "350 pts",
    status: "Ready to stage",
    tone: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100",
  },
  {
    icon: Users,
    title: "Community Signal",
    summary: "Join announcements, invite real builders and complete weekly discussion prompts.",
    points: "280 pts",
    status: "Drafted",
    tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  },
  {
    icon: ClipboardCheck,
    title: "Product Feedback",
    summary: "Test Guard reports, submit useful feedback and help improve Gray Zone review flows.",
    points: "420 pts",
    status: "High value",
    tone: "border-amber-400/30 bg-amber-400/10 text-amber-100",
  },
  {
    icon: ShieldCheck,
    title: "Humanity Gate",
    summary: "Complete future liveness checkpoints for campaign eligibility without turning it into KYC.",
    points: "500 pts",
    status: "Admin gated",
    tone: "border-violet-400/30 bg-violet-400/10 text-violet-100",
  },
]

const taskRows = [
  {
    title: "Verify wallet ownership",
    track: "Wallet Proof",
    difficulty: "Core",
    reward: "120 pts",
    state: "Planned",
    icon: WalletCards,
  },
  {
    title: "Run a sample campaign analysis",
    track: "Product Feedback",
    difficulty: "Core",
    reward: "180 pts",
    state: "Ready next",
    icon: Target,
  },
  {
    title: "Submit one actionable report note",
    track: "Product Feedback",
    difficulty: "Weekly",
    reward: "90 pts",
    state: "Drafted",
    icon: ClipboardCheck,
  },
  {
    title: "Complete Humanity Gate challenge",
    track: "Humanity Gate",
    difficulty: "Trust",
    reward: "220 pts",
    state: "Gated",
    icon: BadgeCheck,
  },
  {
    title: "Invite a real campaign builder",
    track: "Community Signal",
    difficulty: "Social",
    reward: "140 pts",
    state: "Planned",
    icon: Users,
  },
  {
    title: "Share a product walkthrough thread",
    track: "Community Signal",
    difficulty: "Boost",
    reward: "110 pts",
    state: "Drafted",
    icon: Megaphone,
  },
]

const rules = [
  "Points are a contribution score, not a token promise.",
  "Duplicate wallets, scripted referrals and low-quality spam should lose eligibility.",
  "Humanity Gate can add trust weight, but wallet risk scoring remains separate.",
  "Campaign owners can export verified contributors when the season opens.",
]

const timeline = [
  ["Phase 01", "Quest design", "Task templates, proof rules and anti-Sybil scoring are being prepared."],
  ["Phase 02", "Private season", "Early users complete real product and community tasks inside the dashboard."],
  ["Phase 03", "Public leaderboard", "Contributor scores become visible with quality filters and dispute review."],
  ["Phase 04", "Eligibility export", "If an airdrop happens, clean contribution data is ready for allocation review."],
]

export default function AirdropTasksPage() {
  return (
    <div className="flex flex-col gap-7">
      <section className="dashboard-hero reveal-up relative overflow-hidden rounded-3xl border border-primary/25 p-6 shadow-[0_0_80px_rgba(56,189,248,0.08)] sm:p-8">
        <div className="pointer-events-none absolute right-[-4rem] top-[-5rem] size-72 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-6rem] left-1/3 size-72 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative z-10 grid gap-8 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <Badge variant="secondary" className="border-primary/30 bg-primary/10 text-primary">
                <Sparkles className="size-3.5" /> Contribution season
              </Badge>
              <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 text-amber-100">
                No token guarantee
              </Badge>
            </div>
            <h1 className="text-gradient animate-gradient-text text-4xl font-semibold sm:text-6xl">
              Airdrop Tasks
            </h1>
            <p className="mt-5 max-w-3xl leading-7 text-slate-300">
              A future-ready quest center for rewarding real community work, clean wallet behavior and useful product feedback without encouraging low-quality farming.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/dashboard/new-analysis" className={`${buttonVariants()} glow-primary hover-lift`}>
                Run product task <ArrowRight data-icon="inline-end" />
              </Link>
              <Link href="/dashboard/admin/humanity" className={`${buttonVariants({ variant: "outline" })} text-white`}>
                Humanity Gate
              </Link>
            </div>
          </div>

          <Card className="glass-panel premium-card animated-border border-emerald-400/20 bg-emerald-400/5">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <Gift className="text-emerald-300" />
                <Badge variant="outline" className="border-emerald-400/30 text-emerald-200">
                  Season 0 setup
                </Badge>
              </div>
              <CardTitle className="text-white">Contributor readiness</CardTitle>
              <CardDescription className="text-slate-300">
                Task engine, proof rules and trust weighting are staged for the first community season.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-slate-300">Quest framework</span>
                  <span className="font-mono text-primary">68%</span>
                </div>
                <Progress value={68} className="h-2" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-background/45 p-3">
                  <p className="text-xs text-muted-foreground">Next unlock</p>
                  <p className="mt-1 font-medium text-white">Private contributors</p>
                </div>
                <div className="rounded-xl border border-border bg-background/45 p-3">
                  <p className="text-xs text-muted-foreground">Quality gate</p>
                  <p className="mt-1 font-medium text-white">Risk + Humanity signals</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {seasonStats.map(([label, value, detail], index) => (
          <Card key={label} className="glass-panel premium-card reveal-up animated-border" style={{ animationDelay: `${index * 80}ms` }}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="font-mono text-2xl text-white">{value}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-300">{detail}</CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="glass-panel premium-card animated-border">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-white">
                <Trophy className="text-primary" /> Quest board
              </CardTitle>
              <CardDescription>
                Task templates ready to become live missions when the contribution season opens.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-primary/30 text-primary">
              12 tasks staged
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-3">
            {taskRows.map((task) => (
              <div
                key={task.title}
                className="premium-card hover-lift grid gap-3 rounded-xl border border-border bg-background/45 p-4 transition-colors hover:border-primary/35 hover:bg-primary/5 md:grid-cols-[1fr_120px_96px_92px]"
              >
                <div className="flex min-w-0 gap-3">
                  <span className="glow-primary flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <task.icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-white">{task.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{task.track}</p>
                  </div>
                </div>
                <Badge variant="secondary" className="w-fit border-slate-500/30 bg-slate-500/10 text-slate-200">
                  {task.difficulty}
                </Badge>
                <span className="font-mono text-sm text-primary">{task.reward}</span>
                <span className="text-sm text-slate-300">{task.state}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="glass-panel premium-card animated-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Crown className="text-amber-300" /> Leaderboard preview
              </CardTitle>
              <CardDescription>Prepared for season launch with quality-weighted ranking.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                ["Builder rank", "Locked"],
                ["Proof streak", "0 weeks"],
                ["Referral quality", "Pending"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-xl border border-border bg-background/45 p-3 text-sm">
                  <span className="text-slate-300">{label}</span>
                  <span className="font-mono text-white">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-panel premium-card border-amber-400/20 bg-amber-400/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <LockKeyhole className="text-amber-300" /> Fair launch rules
              </CardTitle>
              <CardDescription>Contribution points should reward useful work, not automation.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {rules.map((rule) => (
                <div key={rule} className="flex gap-3 rounded-xl border border-amber-400/15 bg-background/35 p-3 text-sm text-slate-300">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber-300" />
                  <span>{rule}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {questTracks.map((track) => (
          <Card key={track.title} className="glass-panel premium-card hover-lift animated-border">
            <CardHeader>
              <div className="mb-3 flex items-center justify-between gap-3">
                <track.icon className="text-primary" />
                <Badge variant="outline" className={track.tone}>{track.status}</Badge>
              </div>
              <CardTitle className="text-white">{track.title}</CardTitle>
              <CardDescription className="text-slate-300">{track.summary}</CardDescription>
            </CardHeader>
            <CardContent className="font-mono text-sm text-primary">{track.points}</CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="glass-panel premium-card animated-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Flame className="text-orange-300" /> Score formula
            </CardTitle>
            <CardDescription>Designed for transparent contribution weighting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <div className="rounded-xl border border-border bg-background/45 p-4">
              <p className="font-mono text-primary">base points x proof quality x trust multiplier</p>
              <p className="mt-2 leading-6">
                Higher-quality proof and clean wallet history can increase ranking. Repeated low-signal tasks should not farm the board.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3">
                <Zap className="mb-2 size-4 text-cyan-200" />
                Fast tasks
              </div>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                <ShieldCheck className="mb-2 size-4 text-emerald-200" />
                Trust boost
              </div>
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3">
                <CircleDollarSign className="mb-2 size-4 text-amber-200" />
                No guarantee
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card animated-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <CalendarClock className="text-primary" /> Launch roadmap
            </CardTitle>
            <CardDescription>How the page can evolve into a real campaign task engine.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {timeline.map(([phase, title, text]) => (
              <div key={phase} className="grid gap-3 rounded-xl border border-border bg-background/45 p-4 sm:grid-cols-[96px_1fr]">
                <span className="font-mono text-xs uppercase tracking-[0.16em] text-primary">{phase}</span>
                <div>
                  <p className="font-medium text-white">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{text}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="glass-panel premium-card data-scan flex flex-col justify-between gap-5 rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-semibold text-white">Ready for real task persistence</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            The UI is structured so future Prisma models can store tasks, submissions, proofs, point ledger entries and exportable eligibility snapshots.
          </p>
        </div>
        <Link href="/dashboard/admin" className={`${buttonVariants({ variant: "outline" })} hover-lift text-white`}>
          Admin planning <GitBranch data-icon="inline-end" />
        </Link>
      </section>
    </div>
  )
}
