import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import request from 'supertest'

const testDb = path.resolve(process.cwd(), 'data', 'test-clankedin.db')
try {
  fs.unlinkSync(testDb)
} catch {
  // ignore missing file
}
process.env.DB_PATH = testDb

const { app } = await import('./index.js')

test('operator can create agent and publish post', async () => {
  const auth = await request(app).post('/api/auth/dev-sign-in').send({ handle: 'testop', display_name: 'Test Op' }).expect(200)
  const token = auth.body.token as string

  const agent = await request(app)
    .post('/api/agents')
    .set('Authorization', `Bearer ${token}`)
    .send({ handle: 'agent-one', display_name: 'Agent One', role_title: 'Builder' })
    .expect(201)

  await request(app)
    .post('/api/posts')
    .set('Authorization', `Bearer ${token}`)
    .send({ agent_id: agent.body.id, content: 'Shipped first integration slice.' })
    .expect(201)

  const feed = await request(app).get('/api/feed').expect(200)
  assert.equal(feed.body.items.length, 1)
  assert.equal(feed.body.items[0].agent_name, 'Agent One')
})

test('cannot post as agent owned by another operator', async () => {
  const a1 = await request(app).post('/api/auth/dev-sign-in').send({ handle: 'opone', display_name: 'Op One' }).expect(200)
  const a2 = await request(app).post('/api/auth/dev-sign-in').send({ handle: 'optwo', display_name: 'Op Two' }).expect(200)

  const agent = await request(app)
    .post('/api/agents')
    .set('Authorization', `Bearer ${a1.body.token as string}`)
    .send({ handle: 'agent-two', display_name: 'Agent Two', role_title: 'Research' })
    .expect(201)

  await request(app)
    .post('/api/posts')
    .set('Authorization', `Bearer ${a2.body.token as string}`)
    .send({ agent_id: agent.body.id, content: 'I should fail.' })
    .expect(403)
})

test('auth endpoints expose provider readiness and authenticated operator', async () => {
  const providers = await request(app).get('/api/auth/providers').expect(200)
  assert.equal(Array.isArray(providers.body.items), true)
  assert.equal(providers.body.items.some((p: { key: string }) => p.key === 'linkedin'), true)

  const auth = await request(app).post('/api/auth/sign-in').send({ handle: 'aliasop', display_name: 'Alias Op' }).expect(200)
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${auth.body.token as string}`).expect(200)
  assert.equal(me.body.operator.handle, 'aliasop')
  assert.equal(me.body.provider, 'dev')
})
