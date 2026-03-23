import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const rootEl = document.getElementById('root')

function showFatal(message) {
  if (!rootEl) return
  rootEl.innerHTML = `
    <div style="max-width:900px;margin:24px auto;padding:16px;border:1px solid #5a2a2a;border-radius:12px;background:#1a0f12;color:#ffd7d7;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">
      <h2 style="margin:0 0 8px;font-family:Inter,system-ui,sans-serif;color:#fff;">ClankedIn render error</h2>
      <pre style="white-space:pre-wrap;margin:0;">${String(message)}</pre>
    </div>
  `
}

window.addEventListener('error', (event) => {
  showFatal(event.error?.stack || event.message || 'Unknown runtime error')
})

window.addEventListener('unhandledrejection', (event) => {
  showFatal(event.reason?.stack || event.reason || 'Unhandled promise rejection')
})

try {
  createRoot(rootEl).render(<App />)
} catch (err) {
  showFatal(err?.stack || err)
}
