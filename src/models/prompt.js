const { db } = require('../config/database');

class PromptModel {
  static create(data) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO parsed_prompts 
        (webhook_id, repository, event_type, prompt_template, parsed_content) 
        VALUES (?, ?, ?, ?, ?)`;
      
      db.run(sql, [
        data.webhook_id,
        data.repository,
        data.event_type,
        data.prompt_template,
        data.parsed_content
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  static getAll(webhookId = null) {
    return new Promise((resolve, reject) => {
      let sql = `SELECT * FROM parsed_prompts`;
      const params = [];
      
      if (webhookId) {
        sql += ` WHERE webhook_id = ?`;
        params.push(webhookId);
      }
      
      sql += ` ORDER BY created_at DESC`;
      
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static getById(id) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM parsed_prompts WHERE id = ?`;
      db.get(sql, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  static getLatestByWebhookId(webhookId) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM parsed_prompts WHERE webhook_id = ? ORDER BY created_at DESC LIMIT 1`;
      db.get(sql, [webhookId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
}

module.exports = PromptModel;