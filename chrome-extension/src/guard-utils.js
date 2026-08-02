(() => {
  function shortAddress(value) {
    const text = String(value ?? "").trim()
    if (!text) return "Unknown"
    return text.length > 18 ? `${text.slice(0, 8)}...${text.slice(-6)}` : text
  }

  function hostFromUrl(value) {
    try {
      return new URL(value).hostname.replace(/^www\./, "").toLowerCase()
    } catch {
      return ""
    }
  }

  function isUnlimited(amount) {
    const text = String(amount ?? "")
    return text.length > 30 || /^1{20,}$/.test(text)
  }

  function signingExplanation(result) {
    const intent = result?.metadata?.decodedIntent ?? {}
    const category = intent.category ?? "unknown"
    const method = intent.method ? ` via ${intent.method}` : ""
    const amount = intent.amount ? (isUnlimited(intent.amount) ? "an unlimited or extremely high amount" : String(intent.amount)) : null
    const counterparty = intent.spender ?? intent.recipient

    if (category === "approval") {
      return {
        eyebrow: "Wallet approval",
        title: amount ? `Allow a third party to move ${amount}` : "Allow a third party to move tokens",
        detail: `This request grants${counterparty ? ` ${shortAddress(counterparty)}` : " a third party"} permission to spend from your wallet${method}. It does not move funds immediately, but the allowance can be used later.`,
        caution: isUnlimited(intent.amount) ? "Unlimited approvals are high impact. Approve only a contract you independently trust." : "Confirm the spender and allowance match the exact action you intended.",
      }
    }
    if (category === "transfer") {
      return {
        eyebrow: "Asset transfer",
        title: amount ? `Send ${amount}` : "Send assets from your wallet",
        detail: `This request can transfer assets${counterparty ? ` to ${shortAddress(counterparty)}` : " to another account"}${method}. Verify the destination and amount in your wallet prompt.`,
        caution: "Transfers are usually irreversible after confirmation.",
      }
    }
    if (category === "authority") {
      return {
        eyebrow: "Permission change",
        title: "Change control of a token or account",
        detail: `This request may modify an authority, delegate, or owner${counterparty ? ` to ${shortAddress(counterparty)}` : ""}${method}. That can give another account future control.`,
        caution: "Only continue when the new authority is expected and independently verified.",
      }
    }
    if (category === "account_close") {
      return {
        eyebrow: "Account closure",
        title: "Close a token account",
        detail: `This request closes an account${counterparty ? ` and may return its remaining balance to ${shortAddress(counterparty)}` : " and may move its remaining balance"}${method}.`,
        caution: "Confirm which account is closing and where any remaining balance will go.",
      }
    }
    if (category === "mint") {
      return {
        eyebrow: "Token supply change",
        title: "Create tokens or change mint controls",
        detail: `This request affects a token mint or its controls${method}. It can change supply or who has authority over the token.`,
        caution: "Only continue for a mint action you explicitly started.",
      }
    }
    if (category === "signature") {
      const typedData = intent.typedData
      if (typedData?.highImpact) {
        const primaryType = typedData.primaryType || "typed-data request"
        return {
          eyebrow: "High-impact typed data",
          title: `Sign ${primaryType}`,
          detail: `This EIP-712 signature is associated with${typedData.domainName ? ` ${typedData.domainName}` : " a dApp"}${typedData.verifyingContract ? ` and contract ${shortAddress(typedData.verifyingContract)}` : ""}. It can authorize a permit, order, transfer, or delegated action without directly moving funds in this popup.`,
          caution: "Only sign typed data when its domain, contract, and message fields exactly match the action you intended.",
        }
      }
      return {
        eyebrow: "Message signature",
        title: "Sign a message for this site",
        detail: `This request is presented as a message signature${method}. It should not directly transfer funds, but a signature can authorize an off-chain action or login.`,
        caution: "Read the wallet message carefully and never sign a message you do not recognize.",
      }
    }
    return {
      eyebrow: "Wallet request",
      title: intent.instructionCount ? `Review a Solana transaction with ${intent.instructionCount} instruction${intent.instructionCount === 1 ? "" : "s"}` : "Review an unclassified wallet request",
      detail: intent.instructionCount
        ? `ScamGuard identified ${intent.instructionCount} instruction${intent.instructionCount === 1 ? "" : "s"}${Array.isArray(intent.programs) && intent.programs.length ? ` involving ${intent.programs.join(", ")}` : ""}, but did not decode a high-impact transfer, approval, or authority change. Compare the wallet preview with your intended action.`
        : "ScamGuard could not fully decode the requested action. Treat the wallet popup as the source of truth and compare every field with your intended action.",
      caution: "Do not approve until the destination, permissions, and amount are clear.",
    }
  }

  function riskTimeline(result, sourceUrl) {
    const metadata = result?.metadata ?? {}
    const reputation = metadata.reputation ?? {}
    const intent = metadata.decodedIntent ?? {}
    const signals = Array.isArray(result?.signals) ? result.signals : []
    const decision = metadata.decision ?? {}
    const host = metadata.domain ?? hostFromUrl(sourceUrl) ?? "Current site"
    const verifiedSource = reputation.verdict === "trusted" || signals.some((signal) => /VERIFIED_(TRANSACTION_)?SOURCE|VERIFIED_PROJECT_DOMAIN/.test(signal.code ?? ""))
    const sourceLabel = verifiedSource
      ? "Verified source context"
      : reputation.verdict === "known_bad"
        ? "Threat feed match"
        : reputation.verdict === "suspicious"
          ? "Suspicious source context"
          : "Source not yet verified"
    const intentLabel = intent.category && intent.category !== "unknown"
      ? intent.category.replaceAll("_", " ")
      : result?.type === "transaction" ? intent.instructionCount ? `Solana transaction (${intent.instructionCount} instruction${intent.instructionCount === 1 ? "" : "s"})` : "wallet request (not decoded)" : "site and URL read"
    const evidenceLabel = signals.length
      ? `${signals.length} signal${signals.length === 1 ? "" : "s"} considered`
      : "No material signal found"
    return [
      { label: "Source", value: host, status: sourceLabel },
      { label: "Intent", value: intentLabel, status: "Decoded" },
      { label: "Evidence", value: evidenceLabel, status: signals[0]?.title ?? "Clean read" },
      { label: "Decision", value: String(result?.riskLevel ?? "READY").replaceAll("_", " "), status: decision.primaryReason ?? result?.summary ?? "Awaiting scan" },
    ]
  }

  function cleanText(value, limit = 220) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit)
  }

  function redactedTarget(sourceUrl, result) {
    const host = result?.metadata?.domain ?? hostFromUrl(sourceUrl)
    if (host) return host
    const intent = result?.metadata?.decodedIntent ?? {}
    if (intent.category && intent.category !== "unknown") return `${intent.category.replaceAll("_", " ")} request`
    return "Wallet request"
  }

  function shareSnapshot(result, context = {}) {
    const decision = result?.metadata?.decision ?? {}
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      type: result?.type ?? context.type ?? "url",
      chain: result?.metadata?.chain ?? context.chain ?? "unknown",
      target: redactedTarget(context.sourceUrl, result),
      riskLevel: result?.riskLevel ?? "CAUTION",
      shieldScore: Math.max(0, Math.min(100, 100 - Number(result?.score ?? 0))),
      confidence: result?.confidence ?? "LOW",
      summary: cleanText(decision.userMessage ?? result?.summary, 280),
      primaryReason: cleanText(decision.primaryReason ?? result?.explanation, 280),
      timeline: riskTimeline(result, context.sourceUrl).map((item) => ({
        label: cleanText(item.label, 32),
        value: cleanText(item.value, 90),
        status: cleanText(item.status, 140),
      })),
      signals: (result?.signals ?? []).slice(0, 4).map((signal) => ({
        severity: cleanText(signal.severity, 16),
        title: cleanText(signal.title, 100),
        detail: cleanText(signal.detail, 220),
      })),
      actions: (result?.actions ?? []).slice(0, 3).map((action) => cleanText(action, 180)),
    }
  }

  function encodeSnapshot(snapshot) {
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot))
    let binary = ""
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
  }

  globalThis.ScamGuardUtils = {
    hostFromUrl,
    signingExplanation,
    riskTimeline,
    shareSnapshot,
    encodeSnapshot,
    shortAddress,
  }
})()
