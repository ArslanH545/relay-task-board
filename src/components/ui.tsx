import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { dismissToast, useToasts } from '../lib/toast'
import type { Label, Member } from '../lib/types'
import { SWATCHES, errorMessage, initials } from '../lib/util'

/* ---------- Icons (16px, stroke follows text colour) ---------- */

const paths = {
  plus: 'M8 3v10M3 8h10',
  close: 'M4 4l8 8M12 4l-8 8',
  search: 'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zm3.5-1.5L14 14',
  calendar: 'M3 6h10M5 2v2m6-2v2M4 3.5h8a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8h6l.5-8',
  check: 'M3.5 8.5l3 3 6-7',
  people: 'M6 7.5a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5zM2 13c0-2 1.8-3.25 4-3.25S10 11 10 13m1-5.6a2 2 0 1 0-.6-3.9M12 9.9c1.2.4 2 1.4 2 3.1',
  tag: 'M2.5 3.5v4l6.3 6.3a1 1 0 0 0 1.4 0l3.1-3.1a1 1 0 0 0 0-1.4L7 3H3a.5.5 0 0 0-.5.5zM5.25 5.75h.01',
  alert: 'M8 5.5v3m0 2.25h.01M7.1 2.6L1.9 11.5a1 1 0 0 0 .9 1.5h10.4a1 1 0 0 0 .9-1.5L8.9 2.6a1 1 0 0 0-1.8 0z',
  up: 'M8 13V3M4 7l4-4 4 4',
  down: 'M8 3v10M4 9l4 4 4-4',
} as const

export function Icon({ name, size = 16 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}

/* ---------- Avatars ---------- */

export function Avatar({ member, size = 24 }: { member: Member; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ background: member.color, width: size, height: size, fontSize: size * 0.42 }}
      title={member.name}
    >
      {initials(member.name)}
    </span>
  )
}

export function AvatarStack({ members, max = 3, size = 24 }: { members: Member[]; max?: number; size?: number }) {
  if (!members.length) return null
  const shown = members.slice(0, max)
  const extra = members.length - shown.length
  return (
    <span className="avatar-stack" aria-label={`Assigned to ${members.map((m) => m.name).join(', ')}`}>
      {shown.map((member) => <Avatar key={member.id} member={member} size={size} />)}
      {extra > 0 && (
        <span className="avatar avatar-more" style={{ width: size, height: size, fontSize: size * 0.42 }}>
          +{extra}
        </span>
      )}
    </span>
  )
}

export function LabelChip({ label }: { label: Label }) {
  return (
    <span className="label-chip" style={{ '--chip': label.color } as React.CSSProperties}>
      {label.name}
    </span>
  )
}

/* ---------- Modal (native <dialog>: focus trap, Esc and backdrop for free) ---------- */

export function Modal({
  className, labelledBy, onClose, children,
}: { className: string; labelledBy: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current!
    if (!dialog.open) dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={ref}
      className={className}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onMouseDown={(event) => {
        if (event.target === ref.current) onClose() // click on the backdrop
      }}
    >
      {children}
    </dialog>
  )
}

/* ---------- Popover ---------- */

export function Popover({
  trigger, triggerClass = 'btn', label, align = 'start', children,
}: {
  trigger: ReactNode
  triggerClass?: string
  label: string
  align?: 'start' | 'end'
  children: ReactNode | ((close: () => void) => ReactNode)
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div
      className="popover"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          // Keep Esc from also closing the dialog this popover sits in.
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          root.current?.querySelector<HTMLElement>('button')?.focus()
        }
      }}
    >
      <button
        type="button" className={triggerClass} aria-haspopup="dialog" aria-expanded={open}
        aria-label={label} onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open && (
        <div className={`popover-panel popover-${align}`} role="dialog" aria-label={label}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  )
}

/* ---------- Create-with-colour form shared by team members and labels ---------- */

export function NameColorForm({
  placeholder, action, taken, onCreate,
}: {
  placeholder: string
  action: string
  taken: string[]
  onCreate: (name: string, color: string) => Promise<unknown>
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(SWATCHES[taken.length % SWATCHES.length])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const group = useId()

  async function submit() {
    const value = name.trim()
    if (!value || busy) return
    if (taken.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
      setError(`“${value}” already exists.`)
      return
    }
    setBusy(true)
    setError('')
    try {
      await onCreate(value, color)
      setName('')
      setColor(SWATCHES[(taken.length + 1) % SWATCHES.length])
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  // Not a <form>: this renders inside the task dialog's form, and forms can't nest.
  return (
    <div className="name-color">
      <div className="name-color-row">
        <input
          className="input" value={name} placeholder={placeholder} maxLength={40} aria-label={placeholder}
          onChange={(event) => {
            setName(event.target.value)
            setError('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void submit()
            }
          }}
        />
        <button type="button" className="btn btn-primary" disabled={!name.trim() || busy} onClick={submit}>
          {busy ? 'Adding…' : action}
        </button>
      </div>
      <div className="swatches" role="radiogroup" aria-label="Colour">
        {SWATCHES.map((swatch) => (
          <label key={swatch} className="swatch" style={{ background: swatch }}>
            <input
              type="radio" name={group} value={swatch} checked={color === swatch}
              onChange={() => setColor(swatch)} aria-label={swatch}
            />
          </label>
        ))}
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  )
}

/* ---------- Multi-select pickers ---------- */

export function MemberPicker({
  members, selected, onToggle, onAdd,
}: {
  members: Member[]
  selected: string[]
  onToggle: (member: Member) => void
  onAdd: (name: string, color: string) => Promise<unknown>
}) {
  const chosen = members.filter((member) => selected.includes(member.id))
  return (
    <Popover
      label="Assignees"
      triggerClass="picker-trigger"
      trigger={
        chosen.length ? (
          <>
            <AvatarStack members={chosen} max={4} size={22} />
            <span>{chosen.length === 1 ? chosen[0].name : `${chosen.length} people`}</span>
          </>
        ) : (
          <span className="placeholder">Unassigned</span>
        )
      }
    >
      {members.length === 0 && <p className="popover-empty">No team members yet. Add the first one below.</p>}
      <ul className="option-list">
        {members.map((member) => {
          const on = selected.includes(member.id)
          return (
            <li key={member.id}>
              <button type="button" className="option" aria-pressed={on} onClick={() => onToggle(member)}>
                <Avatar member={member} size={22} />
                <span className="option-name">{member.name}</span>
                {on && <Icon name="check" />}
              </button>
            </li>
          )
        })}
      </ul>
      <NameColorForm placeholder="Add a team member" action="Add" taken={members.map((m) => m.name)} onCreate={onAdd} />
    </Popover>
  )
}

export function LabelPicker({
  labels, selected, onToggle, onAdd, onRemove,
}: {
  labels: Label[]
  selected: string[]
  onToggle: (label: Label) => void
  onAdd: (name: string, color: string) => Promise<unknown>
  onRemove: (label: Label) => void
}) {
  const chosen = labels.filter((label) => selected.includes(label.id))
  return (
    <Popover
      label="Labels"
      triggerClass="picker-trigger"
      trigger={
        chosen.length ? (
          <span className="chip-row">{chosen.map((label) => <LabelChip key={label.id} label={label} />)}</span>
        ) : (
          <span className="placeholder">No labels</span>
        )
      }
    >
      {labels.length === 0 && <p className="popover-empty">No labels yet. Create one such as Bug, Feature or Design.</p>}
      <ul className="option-list">
        {labels.map((label) => {
          const on = selected.includes(label.id)
          return (
            <li key={label.id} className="option-with-action">
              <button type="button" className="option" aria-pressed={on} onClick={() => onToggle(label)}>
                <span className="dot" style={{ background: label.color }} />
                <span className="option-name">{label.name}</span>
                {on && <Icon name="check" />}
              </button>
              <button
                type="button" className="icon-btn" aria-label={`Delete the label ${label.name}`}
                title="Delete label everywhere" onClick={() => onRemove(label)}
              >
                <Icon name="trash" size={14} />
              </button>
            </li>
          )
        })}
      </ul>
      <NameColorForm placeholder="New label name" action="Create" taken={labels.map((l) => l.name)} onCreate={onAdd} />
    </Popover>
  )
}

/* ---------- Toasts ---------- */

export function Toasts() {
  const toasts = useToasts()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          {toast.kind === 'error' && <Icon name="alert" />}
          <span>{toast.message}</span>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => dismissToast(toast.id)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
