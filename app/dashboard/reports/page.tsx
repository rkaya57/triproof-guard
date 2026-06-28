import { FileText } from "lucide-react"

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
            <FileText />
          </span>
          <div>
            <CardTitle>Reports</CardTitle>
            <CardDescription>
              Saved campaign reports and export history will appear here.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        No archived reports yet. Run a wallet analysis and export a PDF report to build
        your reporting history.
      </CardContent>
    </Card>
  )
}
