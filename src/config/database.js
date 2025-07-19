const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../../hls_webhooks.db');
const db = new sqlite3.Database(dbPath);

function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        event_type TEXT,
        action TEXT,
        delivery_id TEXT,
        signature TEXT,
        payload TEXT,
        sender_login TEXT,
        sender_id INTEGER,
        repository TEXT,
        verified BOOLEAN
      )`, (err) => {
        if (err) return reject(err);
      });
      
      db.run(`CREATE TABLE IF NOT EXISTS parsed_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        webhook_id INTEGER,
        repository TEXT,
        event_type TEXT,
        prompt_template TEXT,
        parsed_content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(webhook_id) REFERENCES webhooks(id)
      )`, (err) => {
        if (err) return reject(err);
      });
      
      db.run(`CREATE TABLE IF NOT EXISTS claude_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt_id INTEGER,
        response_content TEXT,
        execution_time INTEGER,
        exit_code INTEGER,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(prompt_id) REFERENCES parsed_prompts(id)
      )`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = {
  db,
  initializeDatabase,
  closeDatabase
};