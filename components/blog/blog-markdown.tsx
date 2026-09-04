import type { ReactNode } from "react"

function safeHref(href: string) {
  const value = href.trim()
  if (value.startsWith("/") || value.startsWith("https://") || value.startsWith("http://") || value.startsWith("mailto:")) return value
  return "#"
}

function renderInline(text: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  const parts = text.split(pattern).filter(Boolean)

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`} className="font-semibold text-slate-100">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${part}-${index}`} className="rounded-md border border-white/[0.07] bg-black/20 px-1.5 py-0.5 font-mono text-[0.9em] text-cyan-200">{part.slice(1, -1)}</code>
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      const href = safeHref(linkMatch[2])
      const external = href.startsWith("http://") || href.startsWith("https://")
      return (
        <a
          key={`${part}-${index}`}
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer noopener" : undefined}
          className="font-medium text-cyan-300 underline decoration-cyan-300/30 underline-offset-4 hover:text-cyan-200"
        >
          {linkMatch[1]}
        </a>
      )
    }
    return part
  })
}

type Block =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "code"; language: string; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }

function parseMarkdown(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []
  let index = 0

  while (index < lines.length) {
    const raw = lines[index]
    const line = raw.trim()

    if (!line) {
      index += 1
      continue
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim()
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: "code", language, text: code.join("\n") })
      continue
    }

    if (line.startsWith("# ")) {
      index += 1
      continue
    }

    if (line.startsWith("## ")) {
      blocks.push({ type: "heading", level: 2, text: line.slice(3).trim() })
      index += 1
      continue
    }

    if (line.startsWith("### ")) {
      blocks.push({ type: "heading", level: 3, text: line.slice(4).trim() })
      index += 1
      continue
    }

    if (line.startsWith("> ")) {
      const quote: string[] = []
      while (index < lines.length && lines[index].trim().startsWith("> ")) {
        quote.push(lines[index].trim().slice(2))
        index += 1
      }
      blocks.push({ type: "quote", text: quote.join(" ") })
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""))
        index += 1
      }
      blocks.push({ type: "ul", items })
      continue
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ""))
        index += 1
      }
      blocks.push({ type: "ol", items })
      continue
    }

    const paragraph: string[] = [line]
    index += 1
    while (index < lines.length) {
      const next = lines[index].trim()
      if (!next || next.startsWith("#") || next.startsWith("> ") || next.startsWith("```") || /^[-*]\s+/.test(next) || /^\d+[.)]\s+/.test(next)) break
      paragraph.push(next)
      index += 1
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") })
  }

  return blocks
}

export function BlogMarkdown({ content }: { content: string }) {
  return (
    <div className="max-w-none">
      {parseMarkdown(content).map((block, index) => {
        const key = `${block.type}-${index}`
        if (block.type === "heading") {
          return block.level === 2 ? (
            <h2 key={key} className="text-gradient mb-5 mt-12 text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">{renderInline(block.text)}</h2>
          ) : (
            <h3 key={key} className="mb-4 mt-9 text-2xl font-semibold text-white">{renderInline(block.text)}</h3>
          )
        }
        if (block.type === "paragraph") {
          return <p key={key} className="mb-6 text-[17px] leading-8 text-slate-300">{renderInline(block.text)}</p>
        }
        if (block.type === "quote") {
          return <blockquote key={key} className="my-7 rounded-r-2xl border-l-2 border-cyan-300/50 bg-cyan-300/[0.035] px-5 py-4 text-base leading-7 text-slate-300">{renderInline(block.text)}</blockquote>
        }
        if (block.type === "code") {
          return <pre key={key} className="my-7 overflow-x-auto rounded-2xl border border-white/[0.07] bg-black/30 p-5 text-sm leading-6 text-slate-300"><code>{block.text}</code></pre>
        }
        if (block.type === "ul") {
          return <ul key={key} className="mb-7 grid list-disc gap-2 pl-6 text-[17px] leading-7 text-slate-300">{block.items.map((item) => <li key={item}>{renderInline(item)}</li>)}</ul>
        }
        return <ol key={key} className="mb-7 grid list-decimal gap-2 pl-6 text-[17px] leading-7 text-slate-300">{block.items.map((item) => <li key={item}>{renderInline(item)}</li>)}</ol>
      })}
    </div>
  )
}
