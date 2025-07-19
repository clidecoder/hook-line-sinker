const express = require('express');
const router = express.Router();
const ClaudeResponseModel = require('../models/claudeResponse');
const { executeClaude } = require('../services/claudeService');

// API: Get Claude responses for a prompt
router.get('/api/claude-responses/:promptId', async (req, res) => {
  try {
    const responses = await ClaudeResponseModel.getByPromptId(req.params.promptId);
    res.json(responses);
  } catch (error) {
    console.error('Error fetching Claude responses:', error);
    res.status(500).json({ error: 'Failed to fetch Claude responses' });
  }
});

// API: Execute Claude with a parsed prompt
router.post('/api/claude-execute/:id', async (req, res) => {
  try {
    const promptId = req.params.id;
    console.log(`Manual Claude execution requested for prompt ${promptId}`);
    
    const response = await executeClaude(promptId);
    res.json(response);
  } catch (error) {
    console.error('Error executing Claude:', error);
    res.status(500).json({ 
      error: 'Failed to execute Claude',
      message: error.message 
    });
  }
});

module.exports = router;