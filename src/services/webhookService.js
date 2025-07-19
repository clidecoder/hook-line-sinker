const crypto = require('crypto');
const WebhookModel = require('../models/webhook');
const { processPrompt } = require('./promptService');
const { autoExecuteClaude } = require('./claudeService');

function verifySignature(payload, signature, secret) {
  if (!secret) return true; // Skip verification if no secret configured
  
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  const expected = `sha256=${hmac.digest('hex')}`;
  
  return crypto.timingSafeEqual(
    Buffer.from(signature || ''),
    Buffer.from(expected)
  );
}

function hasClideTag(payload) {
  // Universal auto-execution for all events
  return true;
}

async function processWebhook(req) {
  const signature = req.headers['x-hub-signature-256'];
  const event = req.headers['x-github-event'];
  const delivery = req.headers['x-github-delivery'];
  
  // Get webhook secret from environment
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  
  // Verify signature
  const verified = verifySignature(req.rawBody || JSON.stringify(req.body), signature, secret);
  
  if (secret && !verified) {
    throw new Error('Invalid signature');
  }
  
  // Parse payload
  const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  
  // Save to database
  const webhookId = await WebhookModel.create({
    event_type: event,
    action: payload.action || null,
    delivery_id: delivery,
    signature: signature,
    payload: JSON.stringify(payload),
    sender_login: payload.sender?.login || null,
    sender_id: payload.sender?.id || null,
    repository: payload.repository?.full_name || null,
    verified: verified
  });
  
  console.log(`Webhook ${webhookId} saved: ${event}${payload.action ? '.' + payload.action : ''} from ${payload.sender?.login || 'unknown'}`);
  
  // Process prompt if conditions are met
  if (hasClideTag(payload) && payload.repository?.full_name) {
    try {
      const promptId = await processPrompt(webhookId, payload.repository.full_name, event, payload);
      if (promptId) {
        // Auto-execute Claude for all events
        await autoExecuteClaude(promptId);
      }
    } catch (error) {
      console.error('Error processing prompt:', error);
    }
  }
  
  return webhookId;
}

module.exports = {
  verifySignature,
  hasClideTag,
  processWebhook
};