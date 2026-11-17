import { useCallback, useEffect, useRef, useState } from 'react'
import { backend } from '../lib/backend'
import { toast } from '../lib/toast'
import type { ActivityKind, Label, Member, NewTask, Task, TaskPatch } from '../lib/types'
import { errorMessage } from '../lib/util'

type Phase = 'loading' | 'ready' | 'error'
const LOGGED_FIELDS = ['status', 'title', 'description', 'priority', 'due_date'] as const

/**
 * Owns all board state. Writes are optimistic: the UI changes immediately,
 * and if the request fails the change is rolled back and a toast explains why.
 */
export function useBoard() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  // Bumped whenever an activity row is written so an open task panel refetches.
  const [activityTick, setActivityTick] = useState(0)

  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

  const load = useCallback(async () => {
    setPhase('loading')
    try {
      await backend.init()
      const data = await backend.loadBoard()
      setTasks(data.tasks)
      setMembers(data.members)
      setLabels(data.labels)
      setPhase('ready')
    } catch (cause) {
      setError(errorMessage(cause))
      setPhase('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // The activity log is a convenience; a failed log write never blocks the edit itself.
  const log = useCallback(
    (taskId: string, kind: ActivityKind, detail: Record<string, string | null> = {}) => {
      backend
        .logActivity(taskId, kind, detail)
        .then(() => setActivityTick((n) => n + 1))
        .catch(() => undefined)
    },
    [],
  )

  const patchLocal = (id: string, fn: (task: Task) => Task) =>
    setTasks((current) => current.map((task) => (task.id === id ? fn(task) : task)))

  const createTask = useCallback(
    async (input: Omit<NewTask, 'position'>) => {
      const last = Math.max(
        0,
        ...tasksRef.current.filter((t) => t.status === input.status).map((t) => t.position),
      )
      const task = await backend.createTask({ ...input, position: last + 1000 })
      setTasks((current) => [...current, task])
      log(task.id, 'created')
      return task
    },
    [log],
  )

  const updateTask = useCallback(
    async (id: string, patch: TaskPatch) => {
      const before = tasksRef.current.find((task) => task.id === id)
      if (!before) return
      const changed = Object.fromEntries(
        Object.entries(patch).filter(([key, value]) => before[key as keyof TaskPatch] !== value),
      ) as TaskPatch
      const keys = Object.keys(changed) as (keyof TaskPatch)[]
      if (!keys.length) return

      patchLocal(id, (task) => ({ ...task, ...changed }))
      try {
        await backend.updateTask(id, changed)
        for (const field of LOGGED_FIELDS) {
          if (field in changed) {
            log(id, field, { from: before[field] ?? null, to: changed[field] ?? null })
          }
        }
      } catch (cause) {
        const undo = Object.fromEntries(keys.map((key) => [key, before[key]])) as TaskPatch
        patchLocal(id, (task) => ({ ...task, ...undo }))
        toast.error(`Couldn't save “${before.title}”. Your change was undone. (${errorMessage(cause)})`)
      }
    },
    [log],
  )

  const deleteTask = useCallback(async (id: string) => {
    const snapshot = tasksRef.current
    const task = snapshot.find((t) => t.id === id)
    if (!task) return
    setTasks((current) => current.filter((t) => t.id !== id))
    try {
      await backend.deleteTask(id)
      toast.info(`Deleted “${task.title}”`)
    } catch (cause) {
      setTasks((current) => (current.some((t) => t.id === id) ? current : [...current, task]))
      toast.error(`Couldn't delete “${task.title}”. (${errorMessage(cause)})`)
    }
  }, [])

  const toggleAssignee = useCallback(
    async (taskId: string, member: Member) => {
      const task = tasksRef.current.find((t) => t.id === taskId)
      if (!task) return
      const assigned = task.assigneeIds.includes(member.id)
      const apply = (on: boolean) =>
        patchLocal(taskId, (t) => ({
          ...t,
          assigneeIds: on
            ? [...t.assigneeIds.filter((m) => m !== member.id), member.id]
            : t.assigneeIds.filter((m) => m !== member.id),
        }))
      apply(!assigned)
      try {
        await (assigned
          ? backend.removeAssignee(taskId, member.id)
          : backend.addAssignee(taskId, member.id))
        log(taskId, assigned ? 'unassigned' : 'assigned', { name: member.name })
      } catch (cause) {
        apply(assigned)
        toast.error(`Couldn't update assignees. (${errorMessage(cause)})`)
      }
    },
    [log],
  )

  const toggleLabel = useCallback(
    async (taskId: string, label: Label) => {
      const task = tasksRef.current.find((t) => t.id === taskId)
      if (!task) return
      const applied = task.labelIds.includes(label.id)
      const apply = (on: boolean) =>
        patchLocal(taskId, (t) => ({
          ...t,
          labelIds: on
            ? [...t.labelIds.filter((l) => l !== label.id), label.id]
            : t.labelIds.filter((l) => l !== label.id),
        }))
      apply(!applied)
      try {
        await (applied
          ? backend.removeTaskLabel(taskId, label.id)
          : backend.addTaskLabel(taskId, label.id))
        log(taskId, applied ? 'label_removed' : 'label_added', { name: label.name })
      } catch (cause) {
        apply(applied)
        toast.error(`Couldn't update labels. (${errorMessage(cause)})`)
      }
    },
    [log],
  )

  const addMember = useCallback(async (name: string, color: string) => {
    const member = await backend.createMember(name, color)
    setMembers((current) => [...current, member])
    return member
  }, [])

  const removeMember = useCallback(async (member: Member) => {
    try {
      await backend.deleteMember(member.id)
      setMembers((current) => current.filter((m) => m.id !== member.id))
      setTasks((current) =>
        current.map((t) =>
          t.assigneeIds.includes(member.id)
            ? { ...t, assigneeIds: t.assigneeIds.filter((m) => m !== member.id) }
            : t,
        ),
      )
    } catch (cause) {
      toast.error(`Couldn't remove ${member.name}. (${errorMessage(cause)})`)
    }
  }, [])

  const addLabel = useCallback(async (name: string, color: string) => {
    const label = await backend.createLabel(name, color)
    setLabels((current) => [...current, label])
    return label
  }, [])

  const removeLabel = useCallback(async (label: Label) => {
    try {
      await backend.deleteLabel(label.id)
      setLabels((current) => current.filter((l) => l.id !== label.id))
      setTasks((current) =>
        current.map((t) =>
          t.labelIds.includes(label.id)
            ? { ...t, labelIds: t.labelIds.filter((l) => l !== label.id) }
            : t,
        ),
      )
    } catch (cause) {
      toast.error(`Couldn't delete the label ${label.name}. (${errorMessage(cause)})`)
    }
  }, [])

  return {
    phase, error, tasks, members, labels, activityTick,
    reload: load, createTask, updateTask, deleteTask, toggleAssignee, toggleLabel,
    addMember, removeMember, addLabel, removeLabel,
  }
}

export type BoardStore = ReturnType<typeof useBoard>
