export type Status = 'todo' | 'in_progress' | 'in_review' | 'done'
export type Priority = 'low' | 'normal' | 'high'

export interface Task {
  id: string
  title: string
  description: string
  status: Status
  priority: Priority
  due_date: string | null // YYYY-MM-DD
  position: number
  created_at: string
  assigneeIds: string[]
  labelIds: string[]
}

export interface Member {
  id: string
  name: string
  color: string
}

export interface Label {
  id: string
  name: string
  color: string
}

export interface Comment {
  id: string
  task_id: string
  body: string
  created_at: string
}

export type ActivityKind =
  | 'created'
  | 'status'
  | 'title'
  | 'description'
  | 'priority'
  | 'due_date'
  | 'assigned'
  | 'unassigned'
  | 'label_added'
  | 'label_removed'

export interface Activity {
  id: string
  task_id: string
  kind: ActivityKind
  detail: Record<string, string | null>
  created_at: string
}

export interface NewTask {
  title: string
  description: string
  status: Status
  priority: Priority
  due_date: string | null
  position: number
  assigneeIds: string[]
  labelIds: string[]
}

export type TaskPatch = Partial<
  Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'due_date' | 'position'>
>

export interface BoardData {
  tasks: Task[]
  members: Member[]
  labels: Label[]
}

export const COLUMNS: { id: Status; title: string; empty: string }[] = [
  { id: 'todo', title: 'To Do', empty: 'Nothing queued. Add a task or drop one here.' },
  { id: 'in_progress', title: 'In Progress', empty: 'Drag a task here when work starts.' },
  { id: 'in_review', title: 'In Review', empty: 'Tasks waiting on a second pair of eyes land here.' },
  { id: 'done', title: 'Done', empty: 'Finished work collects here.' },
]

export const STATUS_TITLE: Record<Status, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

export const PRIORITY_TITLE: Record<Priority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
}
