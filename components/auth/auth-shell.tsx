import Image from "next/image"
import Link from "next/link"
import { Database, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react"

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="security-grid relative min-h-screen overflow-hidden bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="glow-orb -left-40 -top-40 size-[30rem]" style={{ background: "var(--guard-cyan)" }} />
        <div className="glow-orb -bottom-52 -right-36 size-[34rem]" style={{ background: "var(--guard-purple)" }} />
      </div>

      <div className="relative mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-3xl border border-border/75 bg-background/75 shadow-2xl backdrop-blur-xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden border-r border-border/70 bg-primary/[0.045] p-10 lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div>
            <Link href="/" className="inline-flex items-center gap-3">
              <Image src="/logo.svg" alt="Tri-Proof Protocol" width={44} height={44} priority className="rounded-xl" />
              <div>
                <p className="font-semibold text-white">Tri-Proof Protocol</p>
                <p className="text-xs text-muted-foreground">Web3 trust and threat intelligence</p>
              </div>
            </Link>

            <div className="mt-16 max-w-xl">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">Protected workspace access</p>
              <h1 className="text-gradient mt-4 text-4xl font-semibold leading-tight xl:text-5xl">
                Secure Web3 campaigns before rewards or signatures move.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
                Review wallet risk, investigate coordinated activity, and protect communities with account-level security controls.
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {[
              [ShieldCheck, "Revocable sessions", "See active devices and end access immediately."],
              [LockKeyhole, "Verified account recovery", "One-time verification and reset links expire automatically."],
              [KeyRound, "Wallet signatures stay non-custodial", "Tri-Proof never asks for seed phrases or private keys."],
              [Database, "Server-side security controls", "Rate limits and audit events persist across deployments."],
            ].map(([Icon, title, description]) => (
              <div key={String(title)} className="flex gap-3 rounded-2xl border border-border/65 bg-background/45 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{String(title)}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{String(description)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center p-4 sm:p-8 lg:p-10 xl:p-14">
          <div className="w-full max-w-md">
            <Link href="/" className="mb-7 flex items-center gap-3 lg:hidden">
              <Image src="/logo.svg" alt="Tri-Proof Protocol" width={40} height={40} priority className="rounded-xl" />
              <span className="font-semibold">Tri-Proof Protocol</span>
            </Link>
            {children}
            <p className="mt-7 text-center text-xs leading-5 text-muted-foreground">
              Tri-Proof will never ask for your seed phrase, recovery phrase, or private key.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
