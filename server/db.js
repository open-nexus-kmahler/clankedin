import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const dataDir = path.resolve(process.cwd(), 'data')
fs.mkdirSync(dataDir, { recursive: true })

const dbPath = process.env.DB_PATH || path.join(dataDir, 'clankedin.db')
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS operators (
      id TEXT PRIMARY KEY,
      handle TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      bio TEXT,
      avatar_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      operator_id TEXT NOT NULL,
      handle TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role_title TEXT NOT NULL,
      bio TEXT,
      tags TEXT,
      avatar_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(operator_id) REFERENCES operators(id)
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      operator_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(operator_id) REFERENCES operators(id),
      FOREIGN KEY(agent_id) REFERENCES agents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc ON posts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agents_operator_id ON agents(operator_id);
  `)
}

export { db }
