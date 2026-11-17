import type { Backend } from './backend'
import type { Activity, Comment, Label, Member, Task } from './types'

/**
 * Browser-only stand-in used when no Supabase credentials are configured, so
 * the UI can be run and reviewed with zero setup. Same interface as the
 * Supabase backend; data lives in localStorage and never leaves the browser.
 */
interface Store {
  tasks: Task[]
  members: Member[]
  labels: Label[]
  comments: Comment[]
  activity: Activity[]
}

const KEY = 'relay.demo.v1'
const empty = (): Store => ({ tasks: [], members: [], labels: [], comments: [], activity: [] })

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...empty(), ...(JSON.parse(raw) as Partial<Store>) } : empty()
  } catch {
    return empty()
  }
}

let memory: Store | null = null

function write(store: Store) {
  memory = store
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // Storage unavailable (private mode, quota): keep working from memory.
  }
}

const load = () => (memory ??= read())
const now = () => new Date().toISOString()
const id = () => crypto.randomUUID()
const tick = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 120))

function mutate<T>(fn: (store: Store) => T): Promise<T> {
  const store = structuredClone(load())
  const result = fn(store)
  write(store)
  return tick(result)
}

export function createLocalBackend(): Backend {
  return {
    demo: true,
    init: () => tick('local-guest'),
    loadBoard: () => {
      const { tasks, members, labels } = load()
      return tick(structuredClone({ tasks, members, labels }))
    },
    createTask: (input) =>
      mutate((s) => {
        const task: Task = { id: id(), created_at: now(), ...input }
        s.tasks.push(task)
        return task
      }),
    updateTask: (taskId, patch) =>
      mutate((s) => {
        s.tasks = s.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t))
      }),
    deleteTask: (taskId) =>
      mutate((s) => {
        s.tasks = s.tasks.filter((t) => t.id !== taskId)
        s.comments = s.comments.filter((c) => c.task_id !== taskId)
        s.activity = s.activity.filter((a) => a.task_id !== taskId)
      }),
    addAssignee: (taskId, memberId) =>
      mutate((s) => {
        const task = s.tasks.find((t) => t.id === taskId)
        if (task && !task.assigneeIds.includes(memberId)) task.assigneeIds.push(memberId)
      }),
    removeAssignee: (taskId, memberId) =>
      mutate((s) => {
        const task = s.tasks.find((t) => t.id === taskId)
        if (task) task.assigneeIds = task.assigneeIds.filter((m) => m !== memberId)
      }),
    addTaskLabel: (taskId, labelId) =>
      mutate((s) => {
        const task = s.tasks.find((t) => t.id === taskId)
        if (task && !task.labelIds.includes(labelId)) task.labelIds.push(labelId)
      }),
    removeTaskLabel: (taskId, labelId) =>
      mutate((s) => {
        const task = s.tasks.find((t) => t.id === taskId)
        if (task) task.labelIds = task.labelIds.filter((l) => l !== labelId)
      }),
    createMember: (name, color) =>
      mutate((s) => {
        const member = { id: id(), name, color }
        s.members.push(member)
        return member
      }),
    deleteMember: (memberId) =>
      mutate((s) => {
        s.members = s.members.filter((m) => m.id !== memberId)
        s.tasks.forEach((t) => (t.assigneeIds = t.assigneeIds.filter((m) => m !== memberId)))
      }),
    createLabel: (name, color) =>
      mutate((s) => {
        const label = { id: id(), name, color }
        s.labels.push(label)
        return label
      }),
    deleteLabel: (labelId) =>
      mutate((s) => {
        s.labels = s.labels.filter((l) => l.id !== labelId)
        s.tasks.forEach((t) => (t.labelIds = t.labelIds.filter((l) => l !== labelId)))
      }),
    listComments: (taskId) => tick(load().comments.filter((c) => c.task_id === taskId)),
    addComment: (taskId, body) =>
      mutate((s) => {
        const comment = { id: id(), task_id: taskId, body, created_at: now() }
        s.comments.push(comment)
        return comment
      }),
    listActivity: (taskId) =>
      tick(load().activity.filter((a) => a.task_id === taskId).reverse()),
    logActivity: (taskId, kind, detail) =>
      mutate((s) => {
        s.activity.push({ id: id(), task_id: taskId, kind, detail, created_at: now() })
      }),
  }
}
