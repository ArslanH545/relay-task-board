import { createClient } from '@supabase/supabase-js'
import type { Backend } from './backend'
import type { Activity, Comment, Label, Member, Task } from './types'

interface TaskRow extends Omit<Task, 'assigneeIds' | 'labelIds'> {
  task_assignees?: { member_id: string }[]
  task_labels?: { label_id: string }[]
}

const TASK_COLUMNS = 'id, title, description, status, priority, due_date, position, created_at'

function toTask(row: TaskRow): Task {
  const { task_assignees, task_labels, ...task } = row
  return {
    ...task,
    assigneeIds: (task_assignees ?? []).map((a) => a.member_id),
    labelIds: (task_labels ?? []).map((l) => l.label_id),
  }
}

/** Supabase returns errors instead of throwing; turn them into exceptions. */
function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  // Only the public anon key is used here. Row Level Security on every table
  // is what keeps one guest's rows away from another's.
  const supabase = createClient(url, anonKey)
  let session: Promise<string> | null = null

  async function ensureSession(): Promise<string> {
    const existing = await supabase.auth.getSession()
    if (existing.error) throw new Error(existing.error.message)
    if (existing.data.session) return existing.data.session.user.id
    const created = await supabase.auth.signInAnonymously()
    if (created.error || !created.data.user) {
      const reason = created.error?.message ?? 'no user returned'
      throw new Error(`Could not start a guest session (${reason}).`)
    }
    return created.data.user.id
  }

  return {
    demo: false,

    // Memoised so React StrictMode's double effect can't create two guests.
    init() {
      session ??= ensureSession().catch((error) => {
        session = null
        throw error
      })
      return session
    },

    async loadBoard() {
      const [tasks, members, labels] = await Promise.all([
        supabase
          .from('tasks')
          .select(`${TASK_COLUMNS}, task_assignees(member_id), task_labels(label_id)`)
          .order('position'),
        supabase.from('team_members').select('id, name, color').order('created_at'),
        supabase.from('labels').select('id, name, color').order('created_at'),
      ])
      return {
        tasks: (unwrap(tasks) as TaskRow[]).map(toTask),
        members: unwrap(members) as Member[],
        labels: unwrap(labels) as Label[],
      }
    },

    async createTask({ assigneeIds, labelIds, ...fields }) {
      // user_id is filled in by the column default (auth.uid()) and enforced by RLS.
      const row = unwrap(
        await supabase.from('tasks').insert(fields).select(TASK_COLUMNS).single(),
      ) as TaskRow
      if (assigneeIds.length) {
        unwrap(
          await supabase
            .from('task_assignees')
            .insert(assigneeIds.map((member_id) => ({ task_id: row.id, member_id }))),
        )
      }
      if (labelIds.length) {
        unwrap(
          await supabase
            .from('task_labels')
            .insert(labelIds.map((label_id) => ({ task_id: row.id, label_id }))),
        )
      }
      return { ...toTask(row), assigneeIds, labelIds }
    },

    async updateTask(id, patch) {
      unwrap(await supabase.from('tasks').update(patch).eq('id', id))
    },

    async deleteTask(id) {
      unwrap(await supabase.from('tasks').delete().eq('id', id))
    },

    async addAssignee(task_id, member_id) {
      unwrap(await supabase.from('task_assignees').insert({ task_id, member_id }))
    },

    async removeAssignee(task_id, member_id) {
      unwrap(
        await supabase.from('task_assignees').delete().eq('task_id', task_id).eq('member_id', member_id),
      )
    },

    async addTaskLabel(task_id, label_id) {
      unwrap(await supabase.from('task_labels').insert({ task_id, label_id }))
    },

    async removeTaskLabel(task_id, label_id) {
      unwrap(
        await supabase.from('task_labels').delete().eq('task_id', task_id).eq('label_id', label_id),
      )
    },

    async createMember(name, color) {
      return unwrap(
        await supabase.from('team_members').insert({ name, color }).select('id, name, color').single(),
      ) as Member
    },

    async deleteMember(id) {
      unwrap(await supabase.from('team_members').delete().eq('id', id))
    },

    async createLabel(name, color) {
      return unwrap(
        await supabase.from('labels').insert({ name, color }).select('id, name, color').single(),
      ) as Label
    },

    async deleteLabel(id) {
      unwrap(await supabase.from('labels').delete().eq('id', id))
    },

    async listComments(taskId) {
      return unwrap(
        await supabase
          .from('comments')
          .select('id, task_id, body, created_at')
          .eq('task_id', taskId)
          .order('created_at'),
      ) as Comment[]
    },

    async addComment(task_id, body) {
      return unwrap(
        await supabase
          .from('comments')
          .insert({ task_id, body })
          .select('id, task_id, body, created_at')
          .single(),
      ) as Comment
    },

    async listActivity(taskId) {
      return unwrap(
        await supabase
          .from('task_activity')
          .select('id, task_id, kind, detail, created_at')
          .eq('task_id', taskId)
          .order('created_at', { ascending: false }),
      ) as Activity[]
    },

    async logActivity(task_id, kind, detail) {
      unwrap(await supabase.from('task_activity').insert({ task_id, kind, detail }))
    },
  }
}
