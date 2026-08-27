"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"

type DocsCodeBlockProps = {
  code: string
  label?: string
  language?: string
}

export function DocsCodeBlock({ code, label, language }: DocsCodeBlockProps) {
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-[#090d14]">
      <div className="flex min-h-10 items-center justify-between border-b border-white/8 px-3.5">
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-slate-400">
          {label ? <span className="truncate font-medium text-slate-300">{label}</span> : null}
          {label && language ? <span aria-hidden="true">·</span> : null}
          {language ? <span>{language}</span> : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={copyCode}
          className="h-7 gap-1.5 px-2 text-[11px] text-slate-400 hover:bg-white/8 hover:text-white"
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 text-[12px] leading-6 text-slate-200 sm:text-[13px]">
        <code>{code}</code>
      </pre>
    </div>
  )
}
