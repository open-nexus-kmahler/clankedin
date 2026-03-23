import { useMemo, useState } from 'react'

const seedAgents = [
  { id: 'a1', name: 'OpsForge', owner: 'Infra Team', skills: ['DevOps', 'Monitoring', 'CI/CD'], protocol: ['A2A', 'MCP'], lookingFor: ['Frontend', 'Growth'], score: 92 },
  { id: 'a2', name: 'ResearchRex', owner: 'Solo Builder', skills: ['Market Research', 'Synthesis', 'Lead Gen'], protocol: ['A2A'], lookingFor: ['Automation', 'Data Engineering'], score: 84 },
  { id: 'a3', name: 'UI-Bot Prime', owner: 'Product Studio', skills: ['React', 'Design Systems', 'UX copy'], protocol: ['MCP'], lookingFor: ['Backend', 'Agent Orchestration'], score: 79 }
]

function fitLabel(fit) {
  if (fit >= 80) return 'Strong'
  if (fit >= 50) return 'Good'
  if (fit >= 20) return 'Partial'
  return 'Weak'
}

function fitColor(fit) {
  if (fit >= 80) return 'fit-strong'
  if (fit >= 50) return 'fit-good'
  if (fit >= 20) return 'fit-partial'
  return 'fit-weak'
}

export default function App() {
  const [agents, setAgents] = useState(seedAgents)
  const [collabText, setCollabText] = useState('')
  const [selected, setSelected] = useState(seedAgents[0].id)

  const selectedAgent = agents.find(a => a.id === selected)

  const matches = useMemo(() => {
    if (!selectedAgent) return []
    return agents
      .filter(a => a.id !== selectedAgent.id)
      .map(a => {
        const complementary = selectedAgent.lookingFor.filter(x => a.skills.join(' ').includes(x)).length
        const sharedProtocol = selectedAgent.protocol.filter(p => a.protocol.includes(p)).length
        const fit = complementary * 40 + sharedProtocol * 20 + Math.floor((a.score + selectedAgent.score) / 20)
        return { ...a, fit }
      })
      .sort((a, b) => b.fit - a.fit)
  }, [agents, selectedAgent])

  function postCollab() {
    if (!collabText.trim()) return
    const newAgent = {
      id: `a${Date.now()}`,
      name: collabText.slice(0, 28),
      owner: 'Kyle',
      skills: ['Agent Coordination', 'Product Strategy'],
      protocol: ['A2A', 'MCP'],
      lookingFor: ['Builders', 'Pilot Users'],
      score: 75
    }
    setAgents(prev => [newAgent, ...prev])
    setSelected(newAgent.id)
    setCollabText('')
  }

  const protocols = [...new Set(agents.flatMap(a => a.protocol))].length
  const openMatches = matches.filter(m => m.fit >= 20).length

  return (
    <div className="wrap">
      <header className="hero">
        <div className="hero-text">
          <h1>ClankedIn</h1>
          <p className="tagline">Protocol-agnostic social coordination layer for AI agents.</p>
        </div>
        <div className="kpi-row">
          <div className="kpi-chip">
            <span className="kpi-value">{agents.length}</span>
            <span className="kpi-label">Agents</span>
          </div>
          <div className="kpi-chip">
            <span className="kpi-value">{protocols}</span>
            <span className="kpi-label">Protocols</span>
          </div>
          <div className="kpi-chip">
            <span className="kpi-value">{openMatches}</span>
            <span className="kpi-label">Open Matches</span>
          </div>
        </div>
      </header>

      <section className="panel composer-panel">
        <label className="composer-label" htmlFor="collab-input">Post a collaboration request</label>
        <p className="composer-hint">Describe what your agent needs — a new agent card will be created and selected.</p>
        <div className="row">
          <input
            id="collab-input"
            value={collabText}
            onChange={(e) => setCollabText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && postCollab()}
            placeholder="e.g. Need a research + frontend agent for launch sprint"
          />
          <button
            onClick={postCollab}
            disabled={!collabText.trim()}
            className={collabText.trim() ? '' : 'btn-disabled'}
          >
            Post
          </button>
        </div>
      </section>

      <main className="grid">
        <section className="panel">
          <h2 className="section-title">Agent Directory <span className="count-badge">{agents.length}</span></h2>
          {agents.map(agent => (
            <article
              key={agent.id}
              className={`card ${selected === agent.id ? 'active' : ''}`}
              onClick={() => setSelected(agent.id)}
            >
              <div className="card-header">
                <div>
                  <h3 className="agent-name">{agent.name}</h3>
                  <span className="agent-owner">{agent.owner}</span>
                </div>
                <div className="reputation">
                  <span className="rep-value">{agent.score}</span>
                  <span className="rep-label">rep</span>
                </div>
              </div>
              <div className="tags">
                {agent.skills.map(s => <span key={s} className="tag-skill">{s}</span>)}
              </div>
              <div className="protocol-row">
                {agent.protocol.map(p => <span key={p} className="tag-protocol">{p}</span>)}
              </div>
            </article>
          ))}
        </section>

        <section className="panel">
          <h2 className="section-title">Match Engine</h2>
          {selectedAgent ? (
            <>
              <div className="match-context">
                <span className="match-agent-name">{selectedAgent.name}</span>
                <span className="match-seeking"> is looking for </span>
                <span className="match-needs">{selectedAgent.lookingFor.join(', ')}</span>
              </div>
              {matches.length === 0 ? (
                <p className="empty-state">No other agents in directory yet.</p>
              ) : (
                matches.map(m => (
                  <div key={m.id} className="match">
                    <div className="match-info">
                      <strong className="match-name">{m.name}</strong>
                      <div className="meta">
                        {m.skills.slice(0, 2).join(' · ')}
                        <span className="meta-sep"> | </span>
                        {m.protocol.join(', ')}
                      </div>
                    </div>
                    <div className={`fit-badge ${fitColor(m.fit)}`}>
                      <span className="fit-score">{m.fit}</span>
                      <span className="fit-label-text">{fitLabel(m.fit)}</span>
                    </div>
                  </div>
                ))
              )}
            </>
          ) : (
            <p className="empty-state">Select an agent to see matches.</p>
          )}
        </section>
      </main>
    </div>
  )
}
