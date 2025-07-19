const express = require('express');
const router = express.Router();
const WebhookModel = require('../models/webhook');
const { processWebhook } = require('../services/webhookService');

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Webhook endpoint
router.post('/webhook', async (req, res) => {
  try {
    const webhookId = await processWebhook(req);
    res.status(200).json({ received: true, id: webhookId });
  } catch (error) {
    console.error('Webhook processing error:', error);
    
    if (error.message === 'Invalid signature') {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API: List webhooks
router.get('/api/webhooks', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const [webhooks, totalCount] = await Promise.all([
      WebhookModel.getAll(limit, offset),
      WebhookModel.count()
    ]);
    
    res.json({
      webhooks,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching webhooks:', error);
    res.status(500).json({ error: 'Failed to fetch webhooks' });
  }
});

// API: Get webhook by ID
router.get('/api/webhooks/:id', async (req, res) => {
  try {
    const webhook = await WebhookModel.getById(req.params.id);
    
    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    
    res.json(webhook);
  } catch (error) {
    console.error('Error fetching webhook:', error);
    res.status(500).json({ error: 'Failed to fetch webhook' });
  }
});

// API: Get webhook payload by ID
router.get('/api/webhooks/:id/payload', async (req, res) => {
  try {
    const webhook = await WebhookModel.getById(req.params.id);
    
    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    
    const payload = JSON.parse(webhook.payload);
    res.json(payload);
  } catch (error) {
    console.error('Error fetching webhook payload:', error);
    res.status(500).json({ error: 'Failed to fetch webhook payload' });
  }
});

// API: Delete webhook
router.delete('/api/webhooks/:id', async (req, res) => {
  try {
    const deleted = await WebhookModel.deleteById(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting webhook:', error);
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

module.exports = router;