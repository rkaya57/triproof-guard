"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react"

import { cn } from "@/lib/utils"

type ToastVariant = "success" | "info" | "error"

type ToastItem = {
  id: number
  message: string
  variant: ToastVariant
}

type ToastContextValue = {
  toast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** Safe to call even without a provider mounted (no-op fallback). */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  return ctx ?? { toast: () => {} }
}

let counter = 0

const variantStyles: Record<
  ToastVariant,
  { border: string; icon: typeof CheckCircle2; iconClass: string }
> = {
  success: {
    border: "border-green-400/40",
    icon: CheckCircle2,
    iconClass: "text-green-300",
  },
  info: {
    border: "border-primary/40",
    icon: Info,
    iconClass: "text-primary",
  },
  error: {
    border: "border-red-400/40",
    icon: AlertTriangle,
    iconClass: "text-red-300",
  },
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const style = variantStyles[item.variant]
  const Icon = style.icon

  useEffect(() => {
    const timeout = window.setTimeout(() => setLeaving(true), 3000)
    const removeTimeout = window.setTimeout(onClose, 3300)
    return () => {
      window.clearTimeout(timeout)
      window.clearTimeout(removeTimeout)
    }
  }, [onClose])

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "glass-panel pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-2xl",
        "transition-all duration-300 ease-out",
        leaving
          ? "translate-x-4 opacity-0"
          : "animate-in fade-in slide-in-from-bottom-3 slide-in-from-right-3",
        style.border
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", style.iconClass)} aria-hidden />
      <span className="min-w-0 flex-1 text-foreground">{item.message}</span>
      <button
        type="button"
        onClick={() => setLeaving(true)}
        aria-label="Dismiss notification"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      counter += 1
      const id = counter
      setToasts((current) => [...current, { id, message, variant }])
    },
    []
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2">
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} onClose={() => remove(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
