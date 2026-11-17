import { useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners,
  useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { COLUMNS, PRIORITY_TITLE, type Label, type Member, type Status, type Task } from '../lib/types'
import { dueLabel, dueState, positionBetween } from '../lib/util'
import { AvatarStack, Icon, LabelChip } from './ui'

type Layout = Record<Status, string[]>

interface BoardProps {
  tasks: Task[] // already filtered
  totals: Record<Status, number> // unfiltered counts per column
  filtered: boolean
  members: Member[]
  labels: Label[]
  onMove: (id: string, status: Status, position: number) => void
  onOpen: (id: string) => void
  onAdd: (status: Status) => void
}

function toLayout(tasks: Task[]): Layout {
  const layout: Layout = { todo: [], in_progress: [], in_review: [], done: [] }
  for (const task of [...tasks].sort((a, b) => a.position - b.position)) {
    layout[task.status].push(task.id)
  }
  return layout
}

function columnOf(id: string, layout: Layout): Status | undefined {
  if (id in layout) return id as Status
  return COLUMNS.find((column) => layout[column.id].includes(id))?.id
}

export function Board({ tasks, totals, filtered, members, labels, onMove, onOpen, onAdd }: BoardProps) {
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const saved = useMemo(() => toLayout(tasks), [tasks])
  // While a card is in the air the board renders from `preview`, so cards
  // make room in the target column before anything is written.
  const [preview, setPreview] = useState<Layout | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const layout = preview ?? saved
  const active = activeId ? byId.get(activeId) : undefined

  const sensors = useSensors(
    // A small drag distance keeps a plain click free to open the task.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Press-and-hold on touch so the columns still scroll normally.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id))
    setPreview(saved)
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    const id = String(active.id)
    const overId = String(over.id)
    setPreview((current) => {
      if (!current) return current
      const from = columnOf(id, current)
      const to = columnOf(overId, current)
      if (!from || !to || from === to) return current
      const overIndex = current[to].indexOf(overId)
      const translated = active.rect.current.translated
      const below = translated ? translated.top > over.rect.top + over.rect.height / 2 : false
      const index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : current[to].length
      return {
        ...current,
        [from]: current[from].filter((item) => item !== id),
        [to]: [...current[to].slice(0, index), id, ...current[to].slice(index)],
      }
    })
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const current = preview
    setActiveId(null)
    setPreview(null)
    const id = String(active.id)
    const task = byId.get(id)
    if (!current || !over || !task) return

    const column = columnOf(id, current)
    if (!column) return
    let ids = current[column]
    const from = ids.indexOf(id)
    const to = ids.indexOf(String(over.id))
    if (to >= 0 && to !== from) ids = arrayMove(ids, from, to)

    if (task.status === column && ids.join() === saved[column].join()) return // dropped where it started
    const index = ids.indexOf(id)
    onMove(
      id,
      column,
      positionBetween(byId.get(ids[index - 1])?.position, byId.get(ids[index + 1])?.position),
    )
  }

  function handleDragCancel() {
    setActiveId(null)
    setPreview(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="board">
        {COLUMNS.map((column) => (
          <Column
            key={column.id}
            status={column.id}
            title={column.title}
            emptyText={
              filtered && totals[column.id] > 0 ? 'No tasks here match the current filters.' : column.empty
            }
            total={totals[column.id]}
            filtered={filtered}
            tasks={layout[column.id].map((id) => byId.get(id)).filter((task): task is Task => !!task)}
            members={members}
            labels={labels}
            isTarget={!!activeId && layout[column.id].includes(activeId)}
            onOpen={onOpen}
            onAdd={onAdd}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
        {active && <CardBody task={active} members={members} labels={labels} overlay />}
      </DragOverlay>
    </DndContext>
  )
}

interface ColumnProps {
  status: Status
  title: string
  emptyText: string
  total: number
  filtered: boolean
  tasks: Task[]
  members: Member[]
  labels: Label[]
  isTarget: boolean
  onOpen: (id: string) => void
  onAdd: (status: Status) => void
}

function Column({ status, title, emptyText, total, filtered, tasks, members, labels, isTarget, onOpen, onAdd }: ColumnProps) {
  const { setNodeRef } = useDroppable({ id: status })
  const ids = tasks.map((task) => task.id)

  return (
    <section className={`column column-${status}${isTarget ? ' is-target' : ''}`} aria-labelledby={`column-${status}`}>
      <header className="column-head">
        <span className="status-mark" aria-hidden="true" />
        <h2 id={`column-${status}`}>{title}</h2>
        <span className="count" aria-label={`${tasks.length} tasks`}>
          {filtered && tasks.length !== total ? `${tasks.length} of ${total}` : total}
        </span>
        <button type="button" className="icon-btn column-add" aria-label={`Add a task to ${title}`} onClick={() => onAdd(status)}>
          <Icon name="plus" />
        </button>
      </header>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="column-body">
          {tasks.map((task) => (
            <SortableCard key={task.id} task={task} members={members} labels={labels} onOpen={onOpen} />
          ))}
          {tasks.length === 0 && (
            <div className="column-empty">
              <p>{emptyText}</p>
              {status === 'todo' && total === 0 && (
                <button type="button" className="btn" onClick={() => onAdd(status)}>
                  <Icon name="plus" /> Add a task
                </button>
              )}
            </div>
          )}
        </div>
      </SortableContext>
    </section>
  )
}

interface CardProps {
  task: Task
  members: Member[]
  labels: Label[]
}

function SortableCard({ task, members, labels, onOpen }: CardProps & { onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  return (
    <div
      ref={setNodeRef}
      className={`card-slot${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-roledescription="draggable task"
      onClick={() => onOpen(task.id)}
    >
      <CardBody task={task} members={members} labels={labels} onOpen={onOpen} />
    </div>
  )
}

function CardBody({ task, members, labels, overlay, onOpen }: CardProps & { overlay?: boolean; onOpen?: (id: string) => void }) {
  const assignees = members.filter((member) => task.assigneeIds.includes(member.id))
  const taskLabels = labels.filter((label) => task.labelIds.includes(label.id))
  const due = dueState(task.due_date, task.status)
  const hasMeta = task.priority !== 'normal' || !!task.due_date || assignees.length > 0

  return (
    <article className={`card priority-${task.priority}${overlay ? ' card-overlay' : ''}`}>
      {taskLabels.length > 0 && (
        <div className="chip-row">
          {taskLabels.map((label) => <LabelChip key={label.id} label={label} />)}
        </div>
      )}
      {/* The title is a real button so the task can be opened from the keyboard. */}
      <button
        type="button" className="card-title" tabIndex={overlay ? -1 : 0}
        onClick={(event) => {
          event.stopPropagation()
          onOpen?.(task.id)
        }}
      >
        {task.title}
      </button>
      {hasMeta && (
        <div className="card-meta">
          {task.priority !== 'normal' && (
            <span className={`priority-tag priority-tag-${task.priority}`}>
              <Icon name={task.priority === 'high' ? 'up' : 'down'} size={12} />
              {PRIORITY_TITLE[task.priority]}
            </span>
          )}
          {task.due_date && due && (
            <span className={`due due-${due}`}>
              <Icon name={due === 'overdue' ? 'alert' : 'calendar'} size={12} />
              {dueLabel(task.due_date, task.status)}
            </span>
          )}
          <span className="card-meta-end">
            <AvatarStack members={assignees} size={22} />
          </span>
        </div>
      )}
    </article>
  )
}
