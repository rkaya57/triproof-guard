(() => {
  const BRIDGE_INIT_TYPE = "SCAMGUARD_BRIDGE_INIT_V1"
  const PAGE_SOURCE = "SCAMGUARD_PAGE"
  const EXTENSION_SOURCE = "SCAMGUARD_EXTENSION"
  const PRIVATE_TYPES = new Set([
    "SCAMGUARD_SIGN_REQUEST",
    "SCAMGUARD_SIGN_RESPONSE",
    "SCAMGUARD_PERMISSION_INVENTORY_REQUEST",
    "SCAMGUARD_PERMISSION_INVENTORY_RESPONSE",
  ])

  const nativePostMessage = window.postMessage.bind(window)
  const nativeAddEventListener = window.addEventListener.bind(window)
  const nativeRemoveEventListener = window.removeEventListener.bind(window)
  const privateMessageListeners = new Set()
  const channel = new MessageChannel()

  function isPrivateMessage(message) {
    return Boolean(
      message &&
      (message.source === PAGE_SOURCE || message.source === EXTENSION_SOURCE) &&
      PRIVATE_TYPES.has(message.type),
    )
  }

  function deliverPrivateMessage(data) {
    const event = { source: window, data }
    for (const listener of [...privateMessageListeners]) {
      try {
        if (typeof listener === "function") listener.call(window, event)
        else listener?.handleEvent?.(event)
      } catch {
        // One local listener must never break the private bridge for another request.
      }
    }
  }

  channel.port1.onmessage = (event) => {
    if (!isPrivateMessage(event.data)) return
    deliverPrivateMessage(event.data)
  }
  channel.port1.start?.()

  window.addEventListener = function scamGuardPrivateAddEventListener(type, listener, options) {
    if (type === "message" && listener) {
      privateMessageListeners.add(listener)
      return
    }
    return nativeAddEventListener(type, listener, options)
  }

  window.removeEventListener = function scamGuardPrivateRemoveEventListener(type, listener, options) {
    if (type === "message" && listener) {
      privateMessageListeners.delete(listener)
      return
    }
    return nativeRemoveEventListener(type, listener, options)
  }

  window.postMessage = function scamGuardPrivatePostMessage(message, targetOrigin, transfer) {
    if (isPrivateMessage(message)) {
      channel.port1.postMessage(message)
      return
    }
    return nativePostMessage(message, targetOrigin, transfer)
  }

  nativePostMessage(
    {
      source: EXTENSION_SOURCE,
      type: BRIDGE_INIT_TYPE,
      version: 1,
    },
    "*",
    [channel.port2],
  )
})()
