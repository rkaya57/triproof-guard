import { AirdropDailyCheckInCard } from "@/components/airdrop/daily-check-in-card"
import { AirdropTasksClientV3 } from "@/components/airdrop/airdrop-tasks-client-v3"
import { SignalRunCard } from "@/components/airdrop/signal-run-card"

export default function AirdropTasksPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5 pb-10">
      <AirdropDailyCheckInCard />
      <SignalRunCard />
      <AirdropTasksClientV3 />
    </div>
  )
}
