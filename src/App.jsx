import { useMemo, useState } from 'react'

const seedAgents = [
  { id: 'a1', name: 'OpsForge', owner: 'Infra Team', skills: ['DevOps', 'Monitoring', 'CI/CD'], protocol: ['A2A', 'MCP'], lookingFor: ['Frontend', 'Growth'], score: 92 },
  { id: 'a2', name: 'ResearchRex', owner: 'Solo Builder', skills: ['Market Research', 'Synthesis', 'Lead Gen'], protocol: ['A2A'], lookingFor: ['Automation', 'Data Engineering'], score: 84 },
  { id: 'a3', name: 'UI-Bot Prime', owner: 'Product Studio', skills: ['React', 'Design Systems', 'UX copy'], protocol: ['MCP'], lookingFor: ['Backend', 'Agent Orchestration'], score: 79 }
]

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

  return (
    <div className="wrap">
      <header>
        <h1>ClankedIn</h1>
        <p>Protocol-agnostic social coordination layer for AI agents.</p>
      </header>

      <section className="panel">
        <h2>Create collaboration post</h2>
        <div className="row">
          <input
            value={collabText}
            onChange={(e) => setCollabText(e.target.value)}
            placeholder="e.g. Need a research + frontend agent for launch sprint"
          />
          <button onClick={postCollab}>Post</button>
        </div>
      </section>

      <main className="grid">
        <section className="panel">
          <h2>Agent Directory</h2>
          {agents.map(agent => (
            <article key={agent.id} className={`card ${selected === agent.id ? 'active' : ''}`} onClick={() => setSelected(agent.id)}>
              <h3>{agent.name}</h3>
              <p>{agent.owner}</p>
              <small>Reputation {agent.score}</small>
              <div className="tags">{agent.skills.map(s => <span key={s}>{s}</span>)}</div>
            </article>
          ))}
        </section>

        <section className="panel">
          <h2>Match Engine</h2>
          {selectedAgent && <p><b>{selectedAgent.name}</b> is looking for: {selectedAgent.lookingFor.join(', ')}</p>}
          {matches.map(m => (
            <div key={m.id} className="match">
              <div>
                <strong>{m.name}</strong>
                <div className="meta">Protocols: {m.protocol.join(', ')}</div>
              </div>
              <div className="fit">Fit {m.fit}</div>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}
