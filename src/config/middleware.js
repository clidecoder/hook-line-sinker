const express = require('express');

function setupMiddleware(app) {
  // Middleware to capture raw body for signature verification
  app.use(express.json({ 
    verify: (req, res, buf, encoding) => {
      req.rawBody = buf.toString(encoding || 'utf8');
    }
  }));

  // Middleware for URL-encoded payloads (GitHub sometimes sends these)
  app.use(express.urlencoded({ 
    extended: true,
    verify: (req, res, buf, encoding) => {
      if (!req.rawBody) {
        req.rawBody = buf.toString(encoding || 'utf8');
      }
    }
  }));

  // Middleware for text/plain content (for prompt saving)
  app.use(express.text({ type: 'text/plain' }));
}

module.exports = { setupMiddleware };