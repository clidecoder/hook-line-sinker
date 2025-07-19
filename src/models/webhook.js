const { db } = require('../config/database');

class WebhookModel {
  static create(data) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO webhooks 
        (event_type, action, delivery_id, signature, payload, sender_login, sender_id, repository, verified) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      db.run(sql, [
        data.event_type,
        data.action,
        data.delivery_id,
        data.signature,
        data.payload,
        data.sender_login,
        data.sender_id,
        data.repository,
        data.verified
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  static getAll(limit = 20, offset = 0) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM webhooks ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
      db.all(sql, [limit, offset], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static getById(id) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM webhooks WHERE id = ?`;
      db.get(sql, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  static deleteById(id) {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM webhooks WHERE id = ?`;
      db.run(sql, [id], function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  }

  static count() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT COUNT(*) as count FROM webhooks`;
      db.get(sql, (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
  }
}

module.exports = WebhookModel;