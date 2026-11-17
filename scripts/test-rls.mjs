// Runs supabase/schema.sql against an in-process Postgres (PGlite) with a
// minimal stand-in for Supabase's auth schema, then checks that two guest
// users cannot read or write each other's rows.
//
//   npm run test:rls
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const db = new PGlite()
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant usage on schema public to authenticated, anon;
`)
await db.exec(schema)
await db.exec(schema) // must be re-runnable

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
await db.exec(`insert into auth.users values ('${A}'), ('${B}')`)

async function as(user, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${user ? 'authenticated' : 'anon'};`)
  try {
    return { rows: (await db.query(sql)).rows }
  } catch (error) {
    return { error: error.message }
  } finally {
    await db.exec('reset role')
  }
}

let failed = 0
function check(name, ok, extra = '') {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`)
}

const a1 = await as(A, `insert into tasks (title) values ('A task') returning id, user_id, status, priority`)
check('A can create a task; user_id/status/priority default', a1.rows?.[0]?.user_id === A && a1.rows[0].status === 'todo' && a1.rows[0].priority === 'normal', JSON.stringify(a1))
const taskA = a1.rows[0].id
const b1 = await as(B, `insert into tasks (title) values ('B task') returning id`)
const taskB = b1.rows[0].id

check('A sees only A tasks', (await as(A, 'select title from tasks')).rows.map(r => r.title).join() === 'A task')
check('B sees only B tasks', (await as(B, 'select title from tasks')).rows.map(r => r.title).join() === 'B task')
check('B cannot update A task', (await as(B, `update tasks set title = 'hacked' where id = '${taskA}' returning id`)).rows.length === 0)
check('B cannot delete A task', (await as(B, `delete from tasks where id = '${taskA}' returning id`)).rows.length === 0)
check('B cannot insert a task as A', !!(await as(B, `insert into tasks (title, user_id) values ('x', '${A}')`)).error)
check('B cannot reassign own task to A', !!(await as(B, `update tasks set user_id = '${A}' where id = '${taskB}'`)).error)
check('B cannot comment on A task', !!(await as(B, `insert into comments (task_id, body) values ('${taskA}', 'hi')`)).error)
check('B cannot log activity on A task', !!(await as(B, `insert into task_activity (task_id, kind) values ('${taskA}', 'created')`)).error)

const memberB = (await as(B, `insert into team_members (name) values ('Bea') returning id`)).rows[0].id
const labelB = (await as(B, `insert into labels (name) values ('Bug') returning id`)).rows[0].id
check('B cannot assign own member to A task', !!(await as(B, `insert into task_assignees (task_id, member_id) values ('${taskA}', '${memberB}')`)).error)
check('B cannot label A task', !!(await as(B, `insert into task_labels (task_id, label_id) values ('${taskA}', '${labelB}')`)).error)
check('A cannot use B member on own task', !!(await as(A, `insert into task_assignees (task_id, member_id) values ('${taskA}', '${memberB}')`)).error)
check('B can assign own member to own task', !(await as(B, `insert into task_assignees (task_id, member_id) values ('${taskB}', '${memberB}')`)).error)
check('B can label own task', !(await as(B, `insert into task_labels (task_id, label_id) values ('${taskB}', '${labelB}')`)).error)
check('A can comment on own task', !(await as(A, `insert into comments (task_id, body) values ('${taskA}', 'note')`)).error)
check('A sees no B members/labels/links', (await as(A, `select 1 from team_members union all select 1 from labels union all select 1 from task_assignees union all select 1 from task_labels`)).rows.length === 0)
check('B sees no A comments', (await as(B, 'select 1 from comments')).rows.length === 0)

const anon = await as(null, 'select * from tasks')
check('No session (anon role) cannot read tasks', !!anon.error || anon.rows.length === 0)
check('Invalid status rejected', !!(await as(A, `insert into tasks (title, status) values ('x', 'nope')`)).error)
check('Blank title rejected', !!(await as(A, `insert into tasks (title) values ('   ')`)).error)

await as(A, `update tasks set status = 'done' where id = '${taskA}'`)
const touched = (await as(A, `select updated_at > created_at as ok from tasks where id = '${taskA}'`)).rows[0]
check('updated_at trigger fires', touched.ok === true)

await as(A, `delete from tasks where id = '${taskA}'`)
await db.exec('reset role')
check('Deleting a task cascades to comments', (await db.query('select 1 from comments')).rows.length === 0)

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed')
process.exit(failed ? 1 : 0)
