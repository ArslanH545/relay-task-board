import { COLUMNS, PRIORITY_TITLE, type Label, type Member, type Priority, type Status } from '../lib/types'
import { Avatar, AvatarStack, Icon, NameColorForm, Popover } from './ui'

export interface Filters {
  query: string
  priority: Priority | ''
  assignee: string // member id, 'none', or ''
  labels: string[]
}

export const NO_FILTERS: Filters = { query: '', priority: '', assignee: '', labels: [] }

export const hasFilters = (filters: Filters) =>
  !!(filters.query.trim() || filters.priority || filters.assignee || filters.labels.length)

interface TopBarProps {
  counts: Record<Status, number>
  overdue: number
  members: Member[]
  labels: Label[]
  filters: Filters
  demo: boolean
  onFilters: (filters: Filters) => void
  onNewTask: () => void
  onAddMember: (name: string, color: string) => Promise<unknown>
  onRemoveMember: (member: Member) => void
}

export function TopBar({
  counts, overdue, members, labels, filters, demo, onFilters, onNewTask, onAddMember, onRemoveMember,
}: TopBarProps) {
  const total = COLUMNS.reduce((sum, column) => sum + counts[column.id], 0)
  const set = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch })

  return (
    <header className="topbar">
      <div className="topbar-main">
        <div className="brand">
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="var(--accent)" />
            <rect x="7" y="8" width="4" height="16" rx="2" fill="#fff" />
            <rect x="14" y="8" width="4" height="11" rx="2" fill="#fff" opacity=".8" />
            <rect x="21" y="8" width="4" height="6" rx="2" fill="#fff" opacity=".6" />
          </svg>
          <h1>Relay</h1>
          <span className="guest-tag" title={demo ? 'No Supabase credentials configured. Tasks are saved in this browser only.' : 'You are signed in as a guest. Tasks are private to this browser session.'}>
            {demo ? 'Local demo' : 'Guest board'}
          </span>
        </div>

        <Flow counts={counts} total={total} overdue={overdue} />

        <div className="topbar-actions">
          <Popover
            label="Team"
            align="end"
            triggerClass="btn team-btn"
            trigger={
              members.length ? (
                <>
                  <AvatarStack members={members} max={4} size={22} />
                  <span className="hide-sm">Team</span>
                </>
              ) : (
                <>
                  <Icon name="people" />
                  <span>Add team</span>
                </>
              )
            }
          >
            <h3 className="popover-title">Team</h3>
            {members.length === 0 && (
              <p className="popover-empty">Add the people you work with, then assign them to tasks.</p>
            )}
            <ul className="option-list">
              {members.map((member) => (
                <li key={member.id} className="option-with-action">
                  <span className="option option-static">
                    <Avatar member={member} size={22} />
                    <span className="option-name">{member.name}</span>
                  </span>
                  <button
                    type="button" className="icon-btn" aria-label={`Remove ${member.name}`}
                    title="Remove from team" onClick={() => onRemoveMember(member)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <NameColorForm placeholder="Name" action="Add" taken={members.map((m) => m.name)} onCreate={onAddMember} />
          </Popover>
          <button type="button" className="btn btn-primary" onClick={onNewTask}>
            <Icon name="plus" /> New task
          </button>
        </div>
      </div>

      <div className="filterbar">
        <label className="search">
          <Icon name="search" />
          <input
            type="search" placeholder="Search tasks by title" aria-label="Search tasks by title"
            value={filters.query} onChange={(event) => set({ query: event.target.value })}
          />
        </label>
        <select
          className="select" aria-label="Filter by priority" value={filters.priority}
          onChange={(event) => set({ priority: event.target.value as Priority | '' })}
        >
          <option value="">Any priority</option>
          {(['high', 'normal', 'low'] as Priority[]).map((priority) => (
            <option key={priority} value={priority}>{PRIORITY_TITLE[priority]} priority</option>
          ))}
        </select>
        <select
          className="select" aria-label="Filter by assignee" value={filters.assignee}
          onChange={(event) => set({ assignee: event.target.value })}
        >
          <option value="">Anyone</option>
          <option value="none">Unassigned</option>
          {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
        {labels.length > 0 && (
          <div className="label-filter" role="group" aria-label="Filter by label">
            {labels.map((label) => {
              const on = filters.labels.includes(label.id)
              return (
                <button
                  key={label.id} type="button" aria-pressed={on}
                  className={`filter-chip${on ? ' is-on' : ''}`}
                  style={{ '--chip': label.color } as React.CSSProperties}
                  onClick={() =>
                    set({ labels: on ? filters.labels.filter((id) => id !== label.id) : [...filters.labels, label.id] })
                  }
                >
                  <span className="dot" /> {label.name}
                </button>
              )
            })}
          </div>
        )}
        {hasFilters(filters) && (
          <button type="button" className="btn btn-quiet" onClick={() => onFilters(NO_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>
    </header>
  )
}

/**
 * Board summary. The bar is the board itself in miniature: one segment per
 * column, sized by how many tasks sit there.
 */
function Flow({ counts, total, overdue }: { counts: Record<Status, number>; total: number; overdue: number }) {
  const done = counts.done
  const percent = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="flow" aria-label="Board summary">
      <dl className="flow-stats">
        <div><dt>Tasks</dt><dd>{total}</dd></div>
        <div><dt>Done</dt><dd>{done}{total > 0 && <small>{percent}%</small>}</dd></div>
        <div className={overdue ? 'is-overdue' : ''}><dt>Overdue</dt><dd>{overdue}</dd></div>
      </dl>
      <div className="flow-bar" role="img" aria-label={COLUMNS.map((c) => `${c.title}: ${counts[c.id]}`).join(', ')}>
        {total === 0 && <span className="flow-seg flow-seg-empty" style={{ flexGrow: 1 }} />}
        {COLUMNS.map((column) =>
          counts[column.id] > 0 ? (
            <span
              key={column.id} className={`flow-seg flow-${column.id}`}
              style={{ flexGrow: counts[column.id] }} title={`${column.title}: ${counts[column.id]}`}
            />
          ) : null,
        )}
      </div>
    </div>
  )
}
