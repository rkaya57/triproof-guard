import { AirdropDailyCheckInCard } from "@/components/airdrop/daily-check-in-card"
import { AirdropTasksClientV2 } from "@/components/airdrop/airdrop-tasks-client-v2"

export default function AirdropTasksPage() {
  return (
    <div className="flex flex-col gap-7">
      <AirdropDailyCheckInCard />
      <AirdropTasksClientV2 />
    </div>
  )
}
