import { Settings } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function Page() {
  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
            <Settings />
          </span>
          <div>
            <CardTitle>Settings</CardTitle>
            <CardDescription>
              Workspace preferences and review policy controls.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Settings are intentionally minimal in the MVP. Gray Zone policy,
        export defaults and team access can be added here as the product grows.
      </CardContent>
    </Card>
  )
}
