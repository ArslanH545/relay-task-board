import { useMemo, useState } from 'react'
import { Board } from './components/Board'
import { TaskDialog } from './components/TaskDialog'
import { TaskDrawer } from './components/TaskDrawer'
import { NO_FILTERS, TopBar, hasFilters, type Filters } from './components/TopBar'
import { Icon, Toasts } from './components/ui'
import { useBoard } from './hooks/useBoard'
import { backend } from './lib/backend'
import { COLUMNS, type Status, type Task } from './lib/types'
import { isOverdue } from './lib/util'

function matches(task: Task, filters: Filters) {
  const query = filters.query.trim().toLowerCase()
  if (query && !task.title.toLowerCase().includes(query)) return false
  if (filters.priority && task.priority !== filters.priority) return false
  if (filters.assignee === 'none' && task.assigneeIds.length) return false
  if (filters.assignee && filters.assignee !== 'none' && !task.assigneeIds.includes(filters.assignee)) return false
  if (filters.labels.length && !filters.labels.some((id) => task.labelIds.includes(id))) return false
  return true
}

export default function App() {
  const board = useBoard()
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [newTaskStatus, setNewTaskStatus] = useState<Status | null>(null)

  // A deleted member or label can't stay selected as a filter.
  const activeFilters = useMemo<Filters>(
    () => ({
      ...filters,
      assignee:
        filters.assignee === 'none' || board.members.some((m) => m.id === filters.assignee) ? filters.assignee : '',
      labels: filters.labels.filter((id) => board.labels.some((l) => l.id === id)),
    }),
    [filters, board.members, board.labels],
  )

  const visible = useMemo(() => board.tasks.filter((task) => matches(task, activeFilters)), [board.tasks, activeFilters])
  const counts = useMemo(() => {
    const result: Record<Status, number> = { todo: 0, in_progress: 0, in_review: 0, done: 0 }
    for (const task of board.tasks) result[task.status]++
    return result
  }, [board.tasks])
  const overdue = useMemo(() => board.tasks.filter((t) => isOverdue(t.due_date, t.status)).length, [board.tasks])
  const openTask = board.tasks.find((task) => task.id === openTaskId)
  const filtering = hasFilters(activeFilters)

  if (board.phase === 'loading') return <LoadingBoard />
  if (board.phase === 'error') return <LoadError message={board.error} onRetry={board.reload} />

  return (
    <div className="app">
      <TopBar
        counts={counts} overdue={overdue} members={board.members} labels={board.labels}
        filters={activeFilters} demo={backend.demo} onFilters={setFilters}
        onNewTask={() => setNewTaskStatus('todo')}
        onAddMember={board.addMember} onRemoveMember={board.removeMember}
      />

      {filtering && visible.length === 0 && board.tasks.length > 0 && (
        <div className="notice" role="status">
          No tasks match these filters.
          <button type="button" className="btn btn-quiet" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>
        </div>
      )}

      <main>
        <Board
          tasks={visible} totals={counts} filtered={filtering} members={board.members} labels={board.labels}
          onMove={(id, status, position) => void board.updateTask(id, { status, position })}
          onOpen={setOpenTaskId}
          onAdd={setNewTaskStatus}
        />
      </main>

      {newTaskStatus && <TaskDialog board={board} initialStatus={newTaskStatus} onClose={() => setNewTaskStatus(null)} />}
      {openTask && <TaskDrawer key={openTask.id} board={board} task={openTask} onClose={() => setOpenTaskId(null)} />}
      <Toasts />
    </div>
  )
}

function LoadingBoard() {
  return (
    <div className="app" aria-busy="true">
      <header className="topbar">
        <div className="topbar-main">
          <div className="brand"><span className="skeleton" style={{ width: 28, height: 28 }} /><span className="skeleton" style={{ width: 90, height: 20 }} /></div>
        </div>
        <div className="filterbar"><span className="skeleton" style={{ width: 260, height: 34 }} /></div>
      </header>
      <main>
        <div className="board" role="status" aria-label="Loading your board">
          {COLUMNS.map((column, index) => (
            <section key={column.id} className={`column column-${column.id}`}>
              <header className="column-head"><span className="status-mark" /><h2>{column.title}</h2></header>
              <div className="column-body">
                {Array.from({ length: 3 - (index % 3) }, (_, i) => (
                  <div key={i} className="card skeleton-card">
                    <span className="skeleton" style={{ width: '75%', height: 14 }} />
                    <span className="skeleton" style={{ width: '45%', height: 12 }} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const anonymousOff = /anonymous/i.test(message)
  return (
    <div className="fatal" role="alert">
      <span className="fatal-icon"><Icon name="alert" size={22} /></span>
      <h1>Your board didn't load</h1>
      <p>{message}</p>
      <p className="muted">
        {anonymousOff
          ? 'Guest sessions need anonymous sign-ins turned on in Supabase: Authentication → Sign In / Providers → Allow anonymous sign-ins.'
          : 'Check your connection and try again.'}
      </p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>Try again</button>
    </div>
  )
}
