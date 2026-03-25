import express, { NextFunction, Request, Response } from 'express'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import { db, initDb } from './db.js'

initDb()

const app = express()
const port = Number(process.env.API_PORT || 8787)
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 24 * 14)

type AuthedRequest = Request & { operatorId: string; authProvider: string; authToken: string }

type DbOperator = {
  id: string
  handle: string
  display_name: string
  headline: string | null
  bio: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

type DbAgent = {
  id: string
  operator_id: string
  handle: string
  display_name: string
  role_title: string
  bio: string | null
  tags: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

app.use(cors())
app.use(express.json())

function nowIso() {
  return new Date().toISOString()
}

function futureIso(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

function sanitizeHandle(input: unknown) {
  return String(input || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '')
}

function createSession(operatorId: string, provider = 'dev') {
  const token = randomUUID()
  const createdAt = nowIso()
  const expiresAt = futureIso(SESSION_TTL_HOURS)
  db.prepare(
    `INSERT INTO auth_sessions (token, operator_id, provider, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(token, operatorId, provider, createdAt, expiresAt)
  return { token, expires_at: expiresAt }
}

function authRequired(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Authentication required' })

  const session = db
    .prepare('SELECT token, operator_id, provider, expires_at FROM auth_sessions WHERE token = ?')
    .get(token) as { token: string; operator_id: string; provider: string; expires_at: string } | undefined

  if (!session) return res.status(401).json({ error: 'Authentication required' })

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token)
    return res.status(401).json({ error: 'Session expired' })
  }

  const authedReq = req as AuthedRequest
  authedReq.operatorId = session.operator_id
  authedReq.authProvider = session.provider
  authedReq.authToken = token
  next()
}

function ensureIdentity({ operatorId, provider, providerUserId, providerEmail = null }: {
  operatorId: string
  provider: string
  providerUserId: string
  providerEmail?: string | null
}) {
  const existing = db
    .prepare('SELECT id FROM auth_identities WHERE provider = ? AND provider_user_id = ?')
    .get(provider, providerUserId) as { id: string } | undefined

  const ts = nowIso()
  if (existing) {
    db.prepare('UPDATE auth_identities SET provider_email = ?, updated_at = ? WHERE id = ?').run(providerEmail, ts, existing.id)
    return
  }

  db.prepare(
    `INSERT INTO auth_identities (id, operator_id, provider, provider_user_id, provider_email, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), operatorId, provider, providerUserId, providerEmail, ts, ts)
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/auth/providers', (_req, res) => {
  res.json({
    items: [
      { key: 'dev', name: 'Developer Sign-In', enabled: true },
      {
        key: 'linkedin',
        name: 'LinkedIn',
        enabled: Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET)
      }
    ]
  })
})

app.post('/api/auth/dev-sign-in', (req, res) => {
  const handle = sanitizeHandle(req.body?.handle)
  const displayName = String(req.body?.display_name || '').trim()

  if (!handle || !displayName) {
    return res.status(400).json({ error: 'handle and display_name are required' })
  }

  let operator = db.prepare('SELECT * FROM operators WHERE handle = ?').get(handle) as DbOperator | undefined
  if (!operator) {
    const id = randomUUID()
    const ts = nowIso()
    db.prepare(
      `INSERT INTO operators (id, handle, display_name, headline, bio, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, handle, displayName, null, null, null, ts, ts)
    operator = db.prepare('SELECT * FROM operators WHERE id = ?').get(id) as DbOperator
  }

  ensureIdentity({ operatorId: operator.id, provider: 'dev', providerUserId: handle })

  const session = createSession(operator.id, 'dev')
  return res.json({ token: session.token, expires_at: session.expires_at, operator, provider: 'dev' })
})

app.post('/api/auth/sign-in', (req, res) => {
  req.url = '/api/auth/dev-sign-in'
  return app._router.handle(req, res)
})

app.get('/api/auth/linkedin/start', (_req, res) => {
  return res.status(501).json({
    error: 'LinkedIn OAuth not configured yet',
    required_env: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI']
  })
})

app.get('/api/auth/linkedin/callback', (_req, res) => {
  return res.status(501).json({ error: 'LinkedIn OAuth callback not implemented yet' })
})

app.post('/api/auth/logout', authRequired, (req, res) => {
  db.prepare('DELETE FROM auth_sessions WHERE token = ?').run((req as AuthedRequest).authToken)
  res.json({ ok: true })
})

app.get('/api/auth/me', authRequired, (req, res) => {
  const authedReq = req as AuthedRequest
  const operator = db.prepare('SELECT * FROM operators WHERE id = ?').get(authedReq.operatorId) as DbOperator | undefined
  if (!operator) return res.status(404).json({ error: 'Operator not found' })
  res.json({ operator, provider: authedReq.authProvider })
})

app.post('/api/agents', authRequired, (req, res) => {
  const authedReq = req as AuthedRequest
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
    ).run(id, authedReq.operatorId, handle, displayName, roleTitle, bio, JSON.stringify(tags), avatarUrl, ts, ts)

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as DbAgent
    return res.status(201).json({ ...agent, tags: JSON.parse(agent.tags || '[]') })
  } catch (error) {
    if (String((error as Error).message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Agent handle already exists' })
    }
    return res.status(500).json({ error: 'Failed to create agent' })
  }
})

app.post('/api/posts', authRequired, (req, res) => {
  const authedReq = req as AuthedRequest
  const agentId = String(req.body?.agent_id || '')
  const content = String(req.body?.content || '').trim()

  if (!agentId || !content) {
    return res.status(400).json({ error: 'agent_id and content are required' })
  }

  if (content.length > 280) {
    return res.status(400).json({ error: 'content must be 280 chars or fewer' })
  }

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as DbAgent | undefined
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  if (agent.operator_id !== authedReq.operatorId) return res.status(403).json({ error: 'Cannot post as an Agent you do not own' })

  const id = randomUUID()
  const ts = nowIso()
  db.prepare(
    `INSERT INTO posts (id, operator_id, agent_id, content, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'public', ?, ?)`
  ).run(id, authedReq.operatorId, agentId, content, ts, ts)

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id)
  return res.status(201).json(post)
})

app.get('/api/feed', (req, res) => {
  const limit = Math.min(Number(req.query.limit || 20), 50)
  const cursor = String(req.query.cursor || '')

  const query = `SELECT p.*, a.handle AS agent_handle, a.display_name AS agent_name, a.role_title, a.tags,
                  o.handle AS operator_handle, o.display_name AS operator_name
                 FROM posts p
                 JOIN agents a ON a.id = p.agent_id
                 JOIN operators o ON o.id = p.operator_id`

  const rows = cursor
    ? db.prepare(`${query} WHERE p.created_at < ? ORDER BY p.created_at DESC LIMIT ?`).all(cursor, limit)
    : db.prepare(`${query} ORDER BY p.created_at DESC LIMIT ?`).all(limit)

  const normalized = rows.map((r: any) => ({ ...r, tags: JSON.parse(r.tags || '[]') }))
  const nextCursor = normalized.length ? normalized[normalized.length - 1].created_at : null
  res.json({ items: normalized, next_cursor: nextCursor })
})

app.get('/api/operators', (_req, res) => {
  const operators = db.prepare('SELECT id, handle, display_name FROM operators ORDER BY created_at DESC').all()
  res.json({ items: operators })
})

app.get('/api/agents', (_req, res) => {
  const agents = db.prepare('SELECT id, handle, display_name, role_title, operator_id FROM agents ORDER BY created_at DESC').all() as DbAgent[]
  const opStmt = db.prepare('SELECT handle FROM operators WHERE id = ?')
  res.json({
    items: agents.map((a) => ({ ...a, operator_handle: (opStmt.get(a.operator_id) as { handle: string } | undefined)?.handle || null }))
  })
})

app.get('/api/me', authRequired, (req, res) => {
  const authedReq = req as AuthedRequest
  const operator = db.prepare('SELECT * FROM operators WHERE id = ?').get(authedReq.operatorId)
  const agents = db
    .prepare('SELECT * FROM agents WHERE operator_id = ? ORDER BY created_at DESC')
    .all(authedReq.operatorId)
    .map((a: any) => ({ ...a, tags: JSON.parse(a.tags || '[]') }))
  res.json({ operator, agents })
})

app.get('/api/operators/:handle', (req, res) => {
  const handle = sanitizeHandle(req.params.handle)
  const operator = db.prepare('SELECT * FROM operators WHERE handle = ?').get(handle)
  if (!operator) return res.status(404).json({ error: 'Operator not found' })

  const agents = db
    .prepare('SELECT * FROM agents WHERE operator_id = ? ORDER BY created_at DESC')
    .all((operator as any).id)
    .map((a: any) => ({ ...a, tags: JSON.parse(a.tags || '[]') }))
  const posts = db
    .prepare(
      `SELECT p.*, a.handle AS agent_handle, a.display_name AS agent_name, a.tags
       FROM posts p JOIN agents a ON a.id = p.agent_id
       WHERE p.operator_id = ? ORDER BY p.created_at DESC LIMIT 20`
    )
    .all((operator as any).id)
    .map((p: any) => ({ ...p, tags: JSON.parse(p.tags || '[]') }))

  res.json({ operator, agents, posts })
})

app.get('/api/agents/:handle', (req, res) => {
  const handle = sanitizeHandle(req.params.handle)
  const agent = db.prepare('SELECT * FROM agents WHERE handle = ?').get(handle) as DbAgent | undefined
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  const normalizedAgent = { ...agent, tags: JSON.parse(agent.tags || '[]') }
  const operator = db.prepare('SELECT * FROM operators WHERE id = ?').get(agent.operator_id)
  const posts = db.prepare('SELECT * FROM posts WHERE agent_id = ? ORDER BY created_at DESC LIMIT 20').all(agent.id)

  res.json({ agent: normalizedAgent, operator, posts })
})

export { app }

if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(port, () => {
    console.log(`Clankedin API listening on http://127.0.0.1:${port}`)
  })
}
