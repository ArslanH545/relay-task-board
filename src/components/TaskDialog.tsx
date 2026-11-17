import { useState, type FormEvent } from 'react'
import type { BoardStore } from '../hooks/useBoard'
import { COLUMNS, PRIORITY_TITLE, type Priority, type Status } from '../lib/types'
import { errorMessage } from '../lib/util'
import { Icon, LabelPicker, MemberPicker, Modal } from './ui'

export function TaskDialog({
  board, initialStatus, onClose,
}: { board: BoardStore; initialStatus: Status; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<Status>(initialStatus)
  const [priority, setPriority] = useState<Priority>('normal')
  const [dueDate, setDueDate] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [labelIds, setLabelIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id]

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) {
      setError('Give the task a title.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await board.createTask({
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        due_date: dueDate || null,
        // Members or labels deleted while the dialog was open are dropped.
        assigneeIds: assigneeIds.filter((id) => board.members.some((m) => m.id === id)),
        labelIds: labelIds.filter((id) => board.labels.some((l) => l.id === id)),
      })
      onClose()
    } catch (cause) {
      setError(`Couldn't create the task. ${errorMessage(cause)}`)
      setSaving(false)
    }
  }

  return (
    <Modal className="dialog" labelledBy="new-task-title" onClose={onClose}>
      <form className="dialog-inner" onSubmit={submit} noValidate>
        <header className="dialog-head">
          <h2 id="new-task-title">New task</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>

        <div className="dialog-body">
          <input
            className="title-input" placeholder="Task title" aria-label="Task title" maxLength={200}
            autoFocus value={title}
            onChange={(event) => {
              setTitle(event.target.value)
              setError('')
            }}
          />
          <textarea
            className="input" rows={3} placeholder="Add a description (optional)" aria-label="Description"
            value={description} onChange={(event) => setDescription(event.target.value)}
          />

          <div className="props">
            <label className="prop">
              <span>Status</span>
              <select className="select" value={status} onChange={(event) => setStatus(event.target.value as Status)}>
                {COLUMNS.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}
              </select>
            </label>
            <label className="prop">
              <span>Priority</span>
              <select className="select" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
                {(['low', 'normal', 'high'] as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_TITLE[p]}</option>)}
              </select>
            </label>
            <label className="prop">
              <span>Due date</span>
              <input className="input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
            <div className="prop">
              <span>Assignees</span>
              <MemberPicker
                members={board.members} selected={assigneeIds}
                onToggle={(member) => setAssigneeIds((list) => toggle(list, member.id))}
                onAdd={board.addMember}
              />
            </div>
            <div className="prop">
              <span>Labels</span>
              <LabelPicker
                labels={board.labels} selected={labelIds}
                onToggle={(label) => setLabelIds((list) => toggle(list, label.id))}
                onAdd={board.addLabel} onRemove={board.removeLabel}
              />
            </div>
          </div>

          {error && <p className="field-error" role="alert">{error}</p>}
        </div>

        <footer className="dialog-foot">
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create task'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
