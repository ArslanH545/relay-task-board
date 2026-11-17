import type {
  Activity, ActivityKind, BoardData, Comment, Label, Member, NewTask, Task, TaskPatch,
} from './types'
import { createSupabaseBackend } from './supabaseBackend'
import { createLocalBackend } from './localBackend'

/**
 * Everything the UI needs from persistence. The app talks to this interface
 * only, so the Supabase calls live in one file and could be swapped for a
 * custom API without touching components.
 */
export interface Backend {
  /** True when running without Supabase credentials (data stays in this browser). */
  readonly demo: boolean
  /** Restores the guest session or creates one. Resolves to the user id. */
  init(): Promise<string>
  loadBoard(): Promise<BoardData>
  createTask(input: NewTask): Promise<Task>
  updateTask(id: string, patch: TaskPatch): Promise<void>
  deleteTask(id: string): Promise<void>
  addAssignee(taskId: string, memberId: string): Promise<void>
  removeAssignee(taskId: string, memberId: string): Promise<void>
  addTaskLabel(taskId: string, labelId: string): Promise<void>
  removeTaskLabel(taskId: string, labelId: string): Promise<void>
  createMember(name: string, color: string): Promise<Member>
  deleteMember(id: string): Promise<void>
  createLabel(name: string, color: string): Promise<Label>
  deleteLabel(id: string): Promise<void>
  listComments(taskId: string): Promise<Comment[]>
  addComment(taskId: string, body: string): Promise<Comment>
  listActivity(taskId: string): Promise<Activity[]>
  logActivity(taskId: string, kind: ActivityKind, detail: Record<string, string | null>): Promise<void>
}

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const backend: Backend =
  url && anonKey ? createSupabaseBackend(url, anonKey) : createLocalBackend()
