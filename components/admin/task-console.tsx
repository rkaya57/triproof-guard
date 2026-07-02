"use client"

import { FormEvent, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type Item = { id: string; title: string; status: string }
const key = "tri-proof-admin-tasks"

function readStoredItems() {
  if (typeof window === "undefined") return []
  const raw = window.localStorage.getItem(key)
  if (!raw) return []
  try {
    return JSON.parse(raw) as Item[]
  } catch {
    return []
  }
}

export function TaskConsole() {
  const [items, setItems] = useState<Item[]>(readStoredItems)

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(items))
  }, [items])

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get("title") ?? "").trim()
    if (!title) return
    setItems((current) => [{ id: `TASK-${current.length + 1}`, title, status: "new" }, ...current])
    event.currentTarget.reset()
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Issue Tracker</CardTitle>
          <CardDescription>Track site issues, fixes and test notes from the admin panel.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="flex gap-3">
            <Input name="title" placeholder="New issue or task" />
            <Button type="submit">Add</Button>
          </form>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <Card key={item.id} className="glass-panel">
            <CardContent className="flex items-center justify-between p-4">
              <span>{item.id} — {item.title}</span>
              <select value={item.status} onChange={(event) => setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: event.target.value } : row))} className="h-9 rounded-lg border border-input bg-background px-3 text-sm">
                <option value="new">New</option>
                <option value="working">Working</option>
                <option value="fixed">Fixed</option>
                <option value="closed">Closed</option>
              </select>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
