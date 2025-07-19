const { db } = require('../config/database');

class ClaudeResponseModel {
  static create(data) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO claude_responses 
        (prompt_id, response_content, execution_time, exit_code, error_message) 
        VALUES (?, ?, ?, ?, ?)`;
      
      db.run(sql, [
        data.prompt_id,
        data.response_content,
        data.execution_time,
        data.exit_code,
        data.error_message
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  static getByPromptId(promptId) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM claude_responses WHERE prompt_id = ? ORDER BY created_at DESC`;
      db.all(sql, [promptId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static getLatestByPromptId(promptId) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM claude_responses WHERE prompt_id = ? ORDER BY created_at DESC LIMIT 1`;
      db.get(sql, [promptId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
}

module.exports = ClaudeResponseModel;