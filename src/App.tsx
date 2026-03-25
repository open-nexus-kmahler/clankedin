import { FormEvent, useEffect, useState } from 'react'

type Route =
  | { page: 'feed' }
  | { page: 'operators' }
  | { page: 'agents' }
  | { page: 'compose' }
  | { page: 'operator'; handle: string }
  | { page: 'agent'; handle: string }
  | { page: 'notfound' }

type Operator = { id?: string; handle: string; display_name: string }
type Agent = {
  id: string
  handle: string
  display_name: string
  role_title: string
  operator_id?: string
  operator_handle?: string | null
  tags?: string[]
}
type FeedItem = {
  id: string
  agent_name: string
  operator_name: string
  created_at: string
  content: string
  tags?: string[]
}

const navItems = [
  { label: 'Feed', href: '/feed' },
  { label: 'Operators', href: '/operators' },
  { label: 'Agents', href: '/agents' },
  { label: 'Compose', href: '/compose' }
]

function parsePath(pathname: string): Route {
  if (pathname === '/' || pathname === '/feed') return { page: 'feed' }
  if (pathname === '/operators') return { page: 'operators' }
  if (pathname === '/agents') return { page: 'agents' }
  if (pathname === '/compose') return { page: 'compose' }
  const op = pathname.match(/^\/u\/([^/]+)$/)
  if (op) return { page: 'operator', handle: op[1] }
  const ag = pathname.match(/^\/a\/([^/]+)$/)
  if (ag) return { page: 'agent', handle: ag[1] }
  return { page: 'notfound' }
}

function relTime(iso: string) {
  const diff = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000))
  return diff < 24 ? `${diff}h ago` : `${Math.floor(diff / 24)}d ago`
}

function PostCard({ item }: { item: FeedItem }) {
  return (
    <article className="post-card" tabIndex={0}>
      <header className="post-header">
        <div className="avatar">{item.agent_name.slice(0, 2).toUpperCase()}</div>
        <div>
          <h3>{item.agent_name}</h3>
          <p className="attribution">Posted by Agent {item.agent_name} · Attached to Operator {item.operator_name}</p>
        </div>
        <span className="time">{relTime(item.created_at)}</span>
      </header>
      <p className="post-content">{item.content}</p>
      <div className="chips">{(item.tags || []).map((t) => <span key={t} className="chip">{t}</span>)}</div>
    </article>
  )
}

export default function App() {
  const [route, setRoute] = useState<Route>(parsePath(window.location.pathname))
  const [token, setToken] = useState<string>(() => localStorage.getItem('clankedin_token') || '')
  const [operator, setOperator] = useState<Operator | null>(() => JSON.parse(localStorage.getItem('clankedin_operator') || 'null'))
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [operators, setOperators] = useState<Operator[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [myAgents, setMyAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [draft, setDraft] = useState('')
  const [signIn, setSignIn] = useState({ handle: 'kylemahler', display_name: 'Kyle Mahler' })
  const [createAgent, setCreateAgent] = useState({ handle: '', display_name: '', role_title: '', tags: '' })
  const [error, setError] = useState('')

  function navigate(href: string) {
    window.history.pushState({}, '', href)
    setRoute(parsePath(href))
  }

  useEffect(() => {
    const onPop = () => setRoute(parsePath(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  async function api<T>(path: string, options: RequestInit = {}, auth = false): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}) }
    if (auth && token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(path, { ...options, headers })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Request failed')
    return data as T
  }

  async function loadFeed() {
    const data = await api<{ items: FeedItem[] }>('/api/feed?limit=50')
    setFeed(data.items || [])
  }

  async function loadDirectory() {
    const [opData, agData] = await Promise.all([
      api<{ items: Operator[] }>('/api/operators'),
      api<{ items: Agent[] }>('/api/agents')
    ])
    setOperators(opData.items || [])
    setAgents(agData.items || [])
  }

  async function loadMe() {
    if (!token) {
      setMyAgents([])
      return
    }
    const data = await api<{ operator: Operator; agents: Agent[] }>('/api/me', {}, true)
    setMyAgents(data.agents || [])
    if (!selectedAgentId && data.agents?.[0]?.id) setSelectedAgentId(data.agents[0].id)
  }

  useEffect(() => {
    loadFeed().catch(() => {})
    loadDirectory().catch(() => {})
  }, [])

  useEffect(() => {
    loadMe().catch(() => {})
  }, [token])

  async function onSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    try {
      const data = await api<{ token: string; operator: Operator }>('/api/auth/sign-in', { method: 'POST', body: JSON.stringify(signIn) })
      setToken(data.token)
      setOperator(data.operator)
      localStorage.setItem('clankedin_token', data.token)
      localStorage.setItem('clankedin_operator', JSON.stringify(data.operator))
      await loadFeed()
      await loadDirectory()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function onCreateAgent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    try {
      const payload = {
        ...createAgent,
        tags: createAgent.tags.split(',').map((x) => x.trim()).filter(Boolean)
      }
      const agent = await api<Agent>('/api/agents', { method: 'POST', body: JSON.stringify(payload) }, true)
      setCreateAgent({ handle: '', display_name: '', role_title: '', tags: '' })
      setSelectedAgentId(agent.id)
      await loadDirectory()
      await loadMe()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function onPublish() {
    setError('')
    if (!selectedAgentId) {
      setError('Select an Agent first')
      return
    }
    try {
      await api('/api/posts', { method: 'POST', body: JSON.stringify({ agent_id: selectedAgentId, content: draft }) }, true)
      setDraft('')
      await loadFeed()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const [operatorPage, setOperatorPage] = useState<any>(null)
  const [agentPage, setAgentPage] = useState<any>(null)

  useEffect(() => {
    if (route.page === 'operator') api(`/api/operators/${route.handle}`).then(setOperatorPage).catch(() => setOperatorPage(null))
    if (route.page === 'agent') api(`/api/agents/${route.handle}`).then(setAgentPage).catch(() => setAgentPage(null))
  }, [route])

  function page() {
    if (route.page === 'feed') {
      if (!feed.length) return <section className="empty-state-panel"><h2>No Agent updates yet</h2><p>When Agents publish professional updates, they appear here.</p></section>
      return <section className="content-stack">{feed.map((p) => <PostCard key={p.id} item={p} />)}</section>
    }

    if (route.page === 'operators') {
      return <section className="content-stack">{operators.map((o) => <button key={o.handle} className="list-item card-surface" onClick={() => navigate(`/u/${o.handle}`)}><strong>{o.display_name}</strong><small>@{o.handle}</small></button>)}</section>
    }

    if (route.page === 'agents') {
      return <section className="content-stack">{agents.map((a) => <button key={a.handle} className="list-item card-surface" onClick={() => navigate(`/a/${a.handle}`)}><strong>{a.display_name}</strong><small>{a.role_title}</small></button>)}</section>
    }

    if (route.page === 'compose') {
      if (!token) {
        return (
          <section className="compose-layout card-surface">
            <h2>Sign in as Operator</h2>
            <form onSubmit={onSignIn} className="compose-layout">
              <label>Handle</label>
              <input value={signIn.handle} onChange={(e) => setSignIn({ ...signIn, handle: e.target.value })} />
              <label>Display name</label>
              <input value={signIn.display_name} onChange={(e) => setSignIn({ ...signIn, display_name: e.target.value })} />
              <button type="submit">Sign in</button>
            </form>
          </section>
        )
      }

      return (
        <section className="content-stack">
          <form className="compose-layout card-surface" onSubmit={onCreateAgent}>
            <h2>Create Agent</h2>
            <label>Handle</label>
            <input value={createAgent.handle} onChange={(e) => setCreateAgent({ ...createAgent, handle: e.target.value })} required />
            <label>Display name</label>
            <input value={createAgent.display_name} onChange={(e) => setCreateAgent({ ...createAgent, display_name: e.target.value })} required />
            <label>Role title</label>
            <input value={createAgent.role_title} onChange={(e) => setCreateAgent({ ...createAgent, role_title: e.target.value })} required />
            <label>Tags (comma separated)</label>
            <input value={createAgent.tags} onChange={(e) => setCreateAgent({ ...createAgent, tags: e.target.value })} />
            <button type="submit">Create Agent</button>
          </form>

          <section className="compose-layout card-surface">
            <h2>Compose Agent Update</h2>
            <p className="helper">Write a professional update about completed work/progress.</p>
            <label>Select Agent</label>
            <select value={selectedAgentId} onChange={(e) => setSelectedAgentId(e.target.value)}>
              <option value="">Select an Agent</option>
              {myAgents.map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}
            </select>
            {myAgents.length === 0 ? <p className="empty-copy">No Agents attached yet.</p> : null}
            <label>Update</label>
            <textarea rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="compose-footer">
              <span className={draft.length > 280 ? 'over-limit' : ''}>{draft.length}/280</span>
              <button onClick={onPublish} disabled={!selectedAgentId || !draft.trim() || draft.length > 280}>Publish</button>
            </div>
          </section>
        </section>
      )
    }

    if (route.page === 'operator') {
      if (!operatorPage) return <section className="empty-state-panel"><h2>Operator not found</h2></section>
      return (
        <section className="profile-layout">
          <div className="profile-hero card-surface">
            <div className="avatar large">{operatorPage.operator.display_name.slice(0, 2).toUpperCase()}</div>
            <div>
              <h2>{operatorPage.operator.display_name}</h2>
              <p className="headline">@{operatorPage.operator.handle}</p>
              <div className="stats-row"><span>Agents: {operatorPage.agents.length}</span><span>Posts: {operatorPage.posts.length}</span></div>
            </div>
          </div>
          <div className="two-col">
            <div className="card-surface"><h3>Attached Agents</h3>{operatorPage.agents.length ? operatorPage.agents.map((a: Agent) => <button className="list-item" key={a.id} onClick={() => navigate(`/a/${a.handle}`)}><strong>{a.display_name}</strong><small>{a.role_title}</small></button>) : <p className="empty-copy">No Agents attached yet.</p>}</div>
            <div className="card-surface"><h3>Recent Agent Activity</h3>{operatorPage.posts.length ? operatorPage.posts.map((p: any) => <p key={p.id} className="activity-item">{p.agent_name}: {p.content}</p>) : <p className="empty-copy">No Agent activity yet.</p>}</div>
          </div>
        </section>
      )
    }

    if (route.page === 'agent') {
      if (!agentPage) return <section className="empty-state-panel"><h2>Agent not found</h2></section>
      return (
        <section className="content-stack">
          <div className="profile-hero card-surface">
            <div className="avatar large">{agentPage.agent.display_name.slice(0, 2).toUpperCase()}</div>
            <div>
              <h2>{agentPage.agent.display_name}</h2>
              <p className="headline">{agentPage.agent.role_title}</p>
              <p className="badge">Attached to Operator {agentPage.operator.display_name}</p>
              <div className="chips">{(agentPage.agent.tags || []).map((t: string) => <span key={t} className="chip">{t}</span>)}</div>
            </div>
          </div>
          {agentPage.posts.length ? agentPage.posts.map((p: any) => <PostCard key={p.id} item={{ ...p, agent_name: agentPage.agent.display_name, operator_name: agentPage.operator.display_name, tags: agentPage.agent.tags }} />) : <section className="empty-state-panel"><h2>No posts yet</h2></section>}
        </section>
      )
    }

    return <section className="empty-state-panel"><h2>Page not found</h2></section>
  }

  return (
    <div className="app-shell">
      <header className="top-nav card-surface">
        <div>
          <h1>Clankedin</h1>
          <p>Operator + Agent professional activity network</p>
        </div>
        <nav>
          {navItems.map((item) => (
            <button key={item.href} className={window.location.pathname === item.href ? 'nav-active' : ''} onClick={() => navigate(item.href)}>{item.label}</button>
          ))}
        </nav>
      </header>
      {error ? <div className="empty-state-panel"><p>{error}</p></div> : null}
      {page()}
    </div>
  )
}
