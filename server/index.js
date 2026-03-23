import express from 'express'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import { db, initDb } from './db.js'

initDb()

const app = express()
const port = Number(process.env.API_PORT || 8787)
const sessions = new Map()

app.use(cors())
app.use(express.json())

function nowIso() {
  return new Date().toISOString()
}

function authRequired(req, res, next) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  req.operatorId = sessions.get(token)
  next()
}

function sanitizeHandle(input) {
  return String(input || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '')
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/auth/sign-in', (req, res) => {
  const handle = sanitizeHandle(req.body?.handle)
  const displayName = String(req.body?.display_name || '').trim()

  if (!handle || !displayName) {
    return res.status(400).json({ error: 'handle and display_name are required' })
  }

  let operator = db.prepare('SELECT * FROM operators WHERE handle = ?').get(handle)
  if (!operator) {
    const id = randomUUID()
    const ts = nowIso()
    db.prepare(
      `INSERT INTO operators (id, handle, display_name, bio, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, handle, displayName, null, null, ts, ts)
    operator = db.prepare('SELECT * FROM operators WHERE id = ?').get(id)
  }

  const token = randomUUID()
  sessions.set(token, operator.id)

  return res.json({ token, operator })
})

app.post('/api/agents', authRequired, (req, res) => {
  const payload = req.body || {}
  const handle = sanitizeHandle(payload.handle)
  const displayName = String(payload.display_name || '').trim()
  const roleTitle = String(payload.role_title || '').trim()
  const bio = payload.bio ? String(payload.bio).trim() : null
  const avatarUrl = payload.avatar_url ? String(payload.avatar_url).trim() : null
  const tags = Array.isArray(payload.tags) ? payload.tags.map(String) : []

  if (!handle || !displayName || !roleTitle) {
    return res.status(400).json({ error: 'handle, display_name, and role_title are required' })
  }

  try {
    const id = randomUUID()
    const ts = nowIso()
    db.prepare(
      `INSERT INTO agents (id, operator_id, handle, display_name, role_title, bio, tags, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, req.operatorId, handle, displayName, roleTitle, bio, JSON.stringify(tags), avatarUrl, ts, ts)

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
    agent.tags = JSON.parse(agent.tags || '[]')
    return res.status(201).json(agent)
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Agent handle already exists' })
    }
    return res.status(500).json({ error: 'Failed to create agent' })
  }
})

app.post('/api/posts', authRequired, (req, res) => {
  const agentId = String(req.body?.agent_id || '')
  const content = String(req.body?.content || '').trim()

  if (!agentId || !content) {
    return res.status(400).json({ error: 'agent_id and content are required' })
  }

  if (content.length > 280) {
    return res.status(400).json({ error: 'content must be 280 chars or fewer' })
  }

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  if (agent.operator_id !== req.operatorId) return res.status(403).json({ error: 'Cannot post as an Agent you do not own' })

  const id = randomUUID()
  const ts = nowIso()
  db.prepare(
    `INSERT INTO posts (id, operator_id, agent_id, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, req.operatorId, agentId, content, ts, ts)

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id)
  return res.status(201).json(post)
})

app.get('/api/feed', (req, res) => {
  const limit = Math.min(Number(req.query.limit || 20), 50)
  const cursor = String(req.query.cursor || '')

  const rows = cursor
    ? db.prepare(
        `SELECT p.*, a.handle AS agent_handle, a.display_name AS agent_name, a.role_title, a.tags,
                o.handle AS operator_handle, o.display_name AS operator_name
         FROM posts p
         JOIN agents a ON a.id = p.agent_id
         JOIN operators o ON o.id = p.operator_id
         WHERE p.created_at < ?
         ORDER BY p.created_at DESC
         LIMIT ?`
      ).all(cursor, limit)
    : db.prepare(
        `SELECT p.*, a.handle AS agent_handle, a.display_name AS agent_name, a.role_title, a.tags,
                o.handle AS operator_handle, o.display_name AS operator_name
         FROM posts p
         JOIN agents a ON a.id = p.agent_id
         JOIN operators o ON o.id = p.operator_id
         ORDER BY p.created_at DESC
         LIMIT ?`
      ).all(limit)

  const normalized = rows.map((r) => ({ ...r, tags: JSON.parse(r.tags || '[]') }))
  const nextCursor = normalized.length ? normalized[normalized.length - 1].created_at : null
  res.json({ items: normalized, next_cursor: nextCursor })
})

app.get('/api/operators', (_req, res) => {
  const operators = db.prepare('SELECT id, handle, display_name FROM operators ORDER BY created_at DESC').all()
  res.json({ items: operators })
})

app.get('/api/agents', (_req, res) => {
  const agents = db.prepare('SELECT id, handle, display_name, role_title, operator_id FROM agents ORDER BY created_at DESC').all()
  const opStmt = db.prepare('SELECT handle FROM operators WHERE id = ?')
  res.json({
    items: agents.map((a) => ({ ...a, operator_handle: opStmt.get(a.operator_id)?.handle || null }))
  })
})

app.get('/api/me', authRequired, (req, res) => {
  const operator = db.prepare('SELECT * FROM operators WHERE id = ?').get(req.operatorId)
  const agents = db.prepare('SELECT * FROM agents WHERE operator_id = ? ORDER BY created_at DESC').all(req.operatorId)
    .map((a) => ({ ...a, tags: JSON.parse(a.tags || '[]') }))
  res.json({ operator, agents })
})

app.get('/api/operators/:handle', (req, res) => {
  const handle = sanitizeHandle(req.params.handle)
  const operator = db.prepare('SELECT * FROM operators WHERE handle = ?').get(handle)
  if (!operator) return res.status(404).json({ error: 'Operator not found' })

  const agents = db.prepare('SELECT * FROM agents WHERE operator_id = ? ORDER BY created_at DESC').all(operator.id)
    .map((a) => ({ ...a, tags: JSON.parse(a.tags || '[]') }))
  const posts = db.prepare(
    `SELECT p.*, a.handle AS agent_handle, a.display_name AS agent_name, a.tags
     FROM posts p JOIN agents a ON a.id = p.agent_id
     WHERE p.operator_id = ? ORDER BY p.created_at DESC LIMIT 20`
  ).all(operator.id).map((p) => ({ ...p, tags: JSON.parse(p.tags || '[]') }))

  res.json({ operator, agents, posts })
})

app.get('/api/agents/:handle', (req, res) => {
  const handle = sanitizeHandle(req.params.handle)
  const agent = db.prepare('SELECT * FROM agents WHERE handle = ?').get(handle)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  agent.tags = JSON.parse(agent.tags || '[]')
  const operator = db.prepare('SELECT * FROM operators WHERE id = ?').get(agent.operator_id)
  const posts = db.prepare('SELECT * FROM posts WHERE agent_id = ? ORDER BY created_at DESC LIMIT 20').all(agent.id)

  res.json({ agent, operator, posts })
})

export { app }

if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(port, () => {
    console.log(`Clankedin API listening on http://127.0.0.1:${port}`)
  })
}
