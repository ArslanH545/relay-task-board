import type { Activity, Priority, Status } from './types'
import { PRIORITY_TITLE, STATUS_TITLE } from './types'

/** Swatches offered for members and labels. */
export const SWATCHES = [
  '#2F4BE0', '#7C4DDB', '#C2389B', '#D9364A', '#E0700B', '#B58900', '#1E9E6A', '#0E8FA8', '#5E6779',
]

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.'

export function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Parses YYYY-MM-DD as a local calendar day (new Date('YYYY-MM-DD') would be UTC). */
function parseDay(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function daysUntil(day: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((parseDay(day).getTime() - today.getTime()) / 86_400_000)
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later' | 'done'

/** "Soon" means within the next three days. Finished tasks are never urgent. */
export function dueState(day: string | null, status: Status): DueState | null {
  if (!day) return null
  if (status === 'done') return 'done'
  const days = daysUntil(day)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 3) return 'soon'
  return 'later'
}

export const isOverdue = (day: string | null, status: Status) => dueState(day, status) === 'overdue'

export function formatDay(day: string) {
  const date = parseDay(day)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

export function dueLabel(day: string, status: Status) {
  const state = dueState(day, status)
  const days = daysUntil(day)
  if (state === 'overdue') return days === -1 ? 'Due yesterday' : `${-days} days overdue`
  if (state === 'today') return 'Due today'
  if (state === 'soon') return days === 1 ? 'Due tomorrow' : `Due in ${days} days`
  return formatDay(day)
}

export function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 45) return 'just now'
  const units: [number, string][] = [[60, 'minute'], [60, 'hour'], [24, 'day'], [7, 'week']]
  let value = seconds / 60
  for (let i = 0; i < units.length; i++) {
    const next = units[i + 1]
    if (!next || value < next[0]) {
      const n = Math.max(1, Math.round(value))
      if (units[i][1] === 'week' && n > 4) break
      return `${n} ${units[i][1]}${n === 1 ? '' : 's'} ago`
    }
    value /= next[0]
  }
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export const fullTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** Human sentence for one activity row. */
export function describeActivity({ kind, detail }: Activity): string {
  switch (kind) {
    case 'created':
      return 'Created this task'
    case 'status':
      return `Moved from ${STATUS_TITLE[detail.from as Status]} → ${STATUS_TITLE[detail.to as Status]}`
    case 'title':
      return `Renamed from “${detail.from}” to “${detail.to}”`
    case 'description':
      return detail.to ? 'Updated the description' : 'Cleared the description'
    case 'priority':
      return `Changed priority from ${PRIORITY_TITLE[detail.from as Priority]} to ${PRIORITY_TITLE[detail.to as Priority]}`
    case 'due_date':
      if (!detail.to) return 'Removed the due date'
      return detail.from
        ? `Moved the due date from ${formatDay(detail.from)} to ${formatDay(detail.to)}`
        : `Set the due date to ${formatDay(detail.to)}`
    case 'assigned':
      return `Assigned ${detail.name}`
    case 'unassigned':
      return `Unassigned ${detail.name}`
    case 'label_added':
      return `Added the label ${detail.name}`
    case 'label_removed':
      return `Removed the label ${detail.name}`
    default:
      return 'Updated this task'
  }
}

/** Position for a card dropped between two neighbours (either may be missing). */
export function positionBetween(before: number | undefined, after: number | undefined) {
  if (before === undefined && after === undefined) return 1000
  if (before === undefined) return after! - 1000
  if (after === undefined) return before + 1000
  return (before + after) / 2
}
