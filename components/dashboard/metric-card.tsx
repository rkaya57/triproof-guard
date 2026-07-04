import type { LucideIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

type MetricCardProps = {
  title: string
  value: string
  description: string
  icon: LucideIcon
}

export function MetricCard({ title, value, description, icon: Icon }: MetricCardProps) {
  const tone =
    title === "Approved"
      ? "from-green-400/10"
      : title === "Gray Zone"
        ? "from-amber-400/10"
        : title === "Rejected" || title === "Rejected / Not Eligible"
          ? "from-red-400/10"
          : title === "Known Entities"
            ? "from-violet-400/10"
            : "from-primary/10"

  return (
    <Card
      className={cn(
        "glass-panel overflow-hidden bg-gradient-to-br to-transparent transition-colors hover:border-primary/45",
        tone
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <CardDescription>{title}</CardDescription>
          <CardTitle className="text-3xl leading-none">{value}</CardTitle>
        </div>
        <span className="flex size-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary shadow-[0_0_24px_rgba(56,189,248,0.14)]">
          <Icon />
        </span>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{description}</CardContent>
    </Card>
  )
}
