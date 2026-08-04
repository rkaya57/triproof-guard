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

    if (intent.batch?.totalCalls) {
      const calls = Array.isArray(intent.batch.calls) ? intent.batch.calls : []
      const approvals = calls.filter((call) => call.category === "approval").length
      const transfers = calls.filter((call) => call.category === "transfer").length
      const unlimited = calls.some((call) => isUnlimited(call.amount) || call.amount === "all assets")
      return {
        eyebrow: intent.batch.atomicRequired ? "Atomic wallet batch" : "Wallet call batch",
        title: `Review ${intent.batch.totalCalls} wallet actions together`,
        detail: `This request bundles ${intent.batch.totalCalls} action${intent.batch.totalCalls === 1 ? "" : "s"}: ${approvals} approval${approvals === 1 ? "" : "s"} and ${transfers} transfer${transfers === 1 ? "" : "s"}. ${intent.batch.atomicRequired ? "The wallet expects the batch to execute as one unit." : "Each call still needs to match your intended action."}`,
        caution: unlimited ? "One step grants unlimited or all-assets approval. Do not approve this batch unless you fully trust every call." : "Open the batch ledger and verify every destination, approval, and amount before continuing.",
      }
    }

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
        const actionLabel = typedData.action === "permit"
          ? "permission to spend tokens"
          : typedData.action === "asset_order"
            ? "an NFT or asset order"
            : typedData.action === "delegation"
              ? "delegated control"
              : "an off-chain authorization"
        return {
          eyebrow: "High-impact typed data",
          title: `Sign ${primaryType}`,
          detail: `This EIP-712 signature can authorize ${actionLabel}${typedData.domainName ? ` for ${typedData.domainName}` : ""}${typedData.verifyingContract ? ` through ${shortAddress(typedData.verifyingContract)}` : ""}${typedData.spender ? ` to ${shortAddress(typedData.spender)}` : ""}${typedData.amount ? ` for ${isUnlimited(typedData.amount) ? "an unlimited amount" : typedData.amount}` : ""}. It may not move funds in this popup, but it can create a usable authorization.`,
          caution: typedData.deadline ? `Check the spender, amount, and expiry (${typedData.deadline}) before you sign.` : "Only sign typed data when its domain, contract, and message fields exactly match the action you intended.",
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
    if (metadata.systemPage) {
      return [
        { label: "Source", value: metadata.domain ?? "Browser system page", status: "Internal browser surface" },
        { label: "Intent", value: "No Web3 action", status: "No wallet request available" },
        { label: "Evidence", value: "Not assessed", status: "External site intelligence was not requested" },
        { label: "Decision", value: "System page", status: "No risk score was created" },
      ]
    }
    const reputation = metadata.reputation ?? {}
    const intent = metadata.decodedIntent ?? {}
    const signals = Array.isArray(result?.signals) ? result.signals : []
    const decision = metadata.decision ?? {}
    const host = String(metadata.domain ?? hostFromUrl(sourceUrl) ?? "Current site").toLowerCase()
    const verifiedSource = reputation.verdict === "trusted" || signals.some((signal) => /VERIFIED_(TRANSACTION_)?SOURCE|VERIFIED_PROJECT_DOMAIN/.test(signal.code ?? ""))
    const sourceLabel = verifiedSource
      ? "Verified project record"
      : reputation.verdict === "known_bad"
        ? "Threat feed match"
        : reputation.verdict === "suspicious"
          ? "Suspicious source context"
          : "No verified project record (not a threat by itself)"
    const intentLabel = intent.batch?.totalCalls
      ? `wallet batch (${intent.batch.totalCalls} call${intent.batch.totalCalls === 1 ? "" : "s"})`
      : intent.category && intent.category !== "unknown"
      ? intent.category.replaceAll("_", " ")
      : result?.type === "transaction" ? intent.instructionCount ? `Solana transaction (${intent.instructionCount} instruction${intent.instructionCount === 1 ? "" : "s"})` : "Wallet request not decoded" : "Site and URL inspected"
    const materialSignals = signals.filter((signal) => signal.severity !== "info")
    const evidenceLabel = materialSignals.length
      ? `${materialSignals.length} risk signal${materialSignals.length === 1 ? "" : "s"} considered`
      : "No material risk signal found"
    const decisionValue = result?.riskLevel === "SAFE"
      ? "No critical threat found"
      : String(result?.riskLevel ?? "READY").replaceAll("_", " ")
    return [
      { label: "Source", value: host, status: sourceLabel },
      { label: "Intent", value: intentLabel, status: "Decoded" },
      { label: "Evidence", value: evidenceLabel, status: materialSignals[0]?.title ?? "No high-confidence risk driver" },
      { label: "Decision", value: decisionValue, status: decision.primaryReason ?? result?.summary ?? "Awaiting scan" },
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
