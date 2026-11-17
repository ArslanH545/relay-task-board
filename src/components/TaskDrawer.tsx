import { useEffect, useState } from 'react'
import type { BoardStore } from '../hooks/useBoard'
import { backend } from '../lib/backend'
import {
  COLUMNS, PRIORITY_TITLE, type Activity, type Comment, type Priority, type Status, type Task,
} from '../lib/types'
import { describeActivity, dueLabel, dueState, errorMessage, fullTime, timeAgo } from '../lib/util'
import { Icon, LabelPicker, MemberPicker, Modal } from './ui'

type Loadable<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; items: T[] }

export function TaskDrawer({ board, task, onClose }: { board: BoardStore; task: Task; onClose: () => void }) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const due = dueState(task.due_date, task.status)

  // Keep the drafts in step if the task changes underneath (e.g. a rollback).
  useEffect(() => setTitle(task.title), [task.title])
  useEffect(() => setDescription(task.description), [task.description])

  function saveTitle() {
    const next = title.trim()
    if (!next) setTitle(task.title)
    else void board.updateTask(task.id, { title: next })
  }

  return (
    <Modal className="drawer" labelledBy="task-title" onClose={onClose}>
      <div className="drawer-inner">
        <header className="drawer-head">
          <span className={`status-pill status-${task.status}`}>
            <span className="status-mark" aria-hidden="true" />
            {COLUMNS.find((column) => column.id === task.status)?.title}
          </span>
          <div className="drawer-head-actions">
            {confirmDelete ? (
              <>
                <span className="confirm-text">Delete this task?</span>
                <button type="button" className="btn btn-quiet" onClick={() => setConfirmDelete(false)}>Keep</button>
                <button
                  type="button" className="btn btn-danger"
                  onClick={() => {
                    onClose()
                    void board.deleteTask(task.id)
                  }}
                >
                  Delete task
                </button>
              </>
            ) : (
              <button type="button" className="icon-btn" aria-label="Delete task" title="Delete task" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" />
              </button>
            )}
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>
        </header>

        <div className="drawer-body">
          <textarea
            id="task-title" className="title-input" rows={1} aria-label="Task title" maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value.replace(/\n/g, ' '))}
            onBlur={saveTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
          />

          <div className="props">
            <label className="prop">
              <span>Status</span>
              <select
                className="select" value={task.status}
                onChange={(event) => void board.updateTask(task.id, { status: event.target.value as Status })}
              >
                {COLUMNS.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}
              </select>
            </label>
            <label className="prop">
              <span>Priority</span>
              <select
                className="select" value={task.priority}
                onChange={(event) => void board.updateTask(task.id, { priority: event.target.value as Priority })}
              >
                {(['low', 'normal', 'high'] as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_TITLE[p]}</option>)}
              </select>
            </label>
            <label className="prop">
              <span>Due date</span>
              <span className="due-field">
                <input
                  className="input" type="date" value={task.due_date ?? ''}
                  onChange={(event) => void board.updateTask(task.id, { due_date: event.target.value || null })}
                />
                {task.due_date && due && due !== 'later' && due !== 'done' && (
                  <span className={`due due-${due}`}>
                    <Icon name={due === 'overdue' ? 'alert' : 'calendar'} size={12} />
                    {dueLabel(task.due_date, task.status)}
                  </span>
                )}
              </span>
            </label>
            <div className="prop">
              <span>Assignees</span>
              <MemberPicker
                members={board.members} selected={task.assigneeIds}
                onToggle={(member) => void board.toggleAssignee(task.id, member)}
                onAdd={board.addMember}
              />
            </div>
            <div className="prop">
              <span>Labels</span>
              <LabelPicker
                labels={board.labels} selected={task.labelIds}
                onToggle={(label) => void board.toggleLabel(task.id, label)}
                onAdd={board.addLabel} onRemove={board.removeLabel}
              />
            </div>
          </div>

          <section className="drawer-section">
            <h3>Description</h3>
            <textarea
              className="input" rows={4} placeholder="Add more detail, links or acceptance criteria."
              aria-label="Description" value={description}
              onChange={(event) => setDescription(event.target.value)}
              onBlur={() => void board.updateTask(task.id, { description: description.trim() })}
            />
          </section>

          <Comments taskId={task.id} />
          <ActivityLog taskId={task.id} tick={board.activityTick} />
        </div>
      </div>
    </Modal>
  )
}

function Comments({ taskId }: { taskId: string }) {
  const [comments, setComments] = useState<Loadable<Comment>>({ state: 'loading' })
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    setComments({ state: 'loading' })
    backend
      .listComments(taskId)
      .then((items) => live && setComments({ state: 'ready', items }))
      .catch((cause) => live && setComments({ state: 'error', message: errorMessage(cause) }))
    return () => {
      live = false
    }
  }, [taskId])

  async function post() {
    const body = draft.trim()
    if (!body || posting) return
    setPosting(true)
    setError('')
    try {
      const comment = await backend.addComment(taskId, body)
      setComments((current) =>
        current.state === 'ready' ? { state: 'ready', items: [...current.items, comment] } : current,
      )
      setDraft('')
    } catch (cause) {
      setError(`Couldn't post the comment. ${errorMessage(cause)}`)
    } finally {
      setPosting(false)
    }
  }

  return (
    <section className="drawer-section">
      <h3>Comments</h3>
      {comments.state === 'loading' && <p className="muted">Loading comments…</p>}
      {comments.state === 'error' && <p className="field-error" role="alert">Couldn't load comments. {comments.message}</p>}
      {comments.state === 'ready' && comments.items.length === 0 && (
        <p className="muted">No comments yet. Leave a note for whoever picks this up next.</p>
      )}
      {comments.state === 'ready' && comments.items.length > 0 && (
        <ol className="comments">
          {comments.items.map((comment) => (
            <li key={comment.id}>
              <p>{comment.body}</p>
              <time dateTime={comment.created_at} title={fullTime(comment.created_at)}>{timeAgo(comment.created_at)}</time>
            </li>
          ))}
        </ol>
      )}
      <div className="composer">
        <textarea
          className="input" rows={2} placeholder="Write a comment" aria-label="Write a comment" maxLength={4000}
          value={draft} onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void post()
          }}
        />
        <div className="composer-foot">
          <span className="muted">Ctrl/⌘ + Enter to post</span>
          <button type="button" className="btn btn-primary" disabled={!draft.trim() || posting} onClick={post}>
            {posting ? 'Posting…' : 'Post comment'}
          </button>
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </section>
  )
}

function ActivityLog({ taskId, tick }: { taskId: string; tick: number }) {
  const [activity, setActivity] = useState<Loadable<Activity>>({ state: 'loading' })

  useEffect(() => {
    let live = true
    backend
      .listActivity(taskId)
      .then((items) => live && setActivity({ state: 'ready', items }))
      .catch((cause) => live && setActivity({ state: 'error', message: errorMessage(cause) }))
    return () => {
      live = false
    }
  }, [taskId, tick])

  return (
    <section className="drawer-section">
      <h3>Activity</h3>
      {activity.state === 'loading' && <p className="muted">Loading activity…</p>}
      {activity.state === 'error' && <p className="field-error" role="alert">Couldn't load activity. {activity.message}</p>}
      {activity.state === 'ready' && activity.items.length === 0 && <p className="muted">No activity recorded yet.</p>}
      {activity.state === 'ready' && activity.items.length > 0 && (
        <ol className="timeline">
          {activity.items.map((item) => (
            <li key={item.id} className={`timeline-${item.kind}`}>
              <span>{describeActivity(item)}</span>
              <time dateTime={item.created_at} title={fullTime(item.created_at)}>{timeAgo(item.created_at)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
