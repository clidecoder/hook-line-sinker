const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;

// Main interface page
router.get('/', async (req, res) => {
  try {
    const htmlContent = await fs.readFile(path.join(__dirname, '../../index.html'), 'utf8');
    res.send(htmlContent);
  } catch (error) {
    console.error('Error reading index.html:', error);
    res.status(500).send('Error loading main page');
  }
});

// Prompt management interface
router.get('/prompts', async (req, res) => {
  try {
    const htmlContent = await fs.readFile(path.join(__dirname, '../../prompts.html'), 'utf8');
    res.send(htmlContent);
  } catch (error) {
    console.error('Error reading prompts.html:', error);
    res.status(500).send('Error loading prompts page');
  }
});

// GitHub events documentation
router.get('/events', async (req, res) => {
  try {
    const htmlContent = await fs.readFile(path.join(__dirname, '../../events.html'), 'utf8');
    res.send(htmlContent);
  } catch (error) {
    console.error('Error reading events.html:', error);
    res.status(500).send('Error loading events page');
  }
});

module.exports = router;