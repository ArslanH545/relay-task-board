import { useSyncExternalStore } from 'react'

export interface Toast {
  id: number
  kind: 'error' | 'info'
  message: string
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit(next: Toast[]) {
  toasts = next
  listeners.forEach((listener) => listener())
}

export function dismissToast(id: number) {
  emit(toasts.filter((t) => t.id !== id))
}

function push(kind: Toast['kind'], message: string) {
  const id = nextId++
  emit([...toasts.slice(-2), { id, kind, message }])
  setTimeout(() => dismissToast(id), kind === 'error' ? 7000 : 3500)
}

export const toast = {
  error: (message: string) => push('error', message),
  info: (message: string) => push('info', message),
}

export function useToasts() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => toasts,
  )
}
