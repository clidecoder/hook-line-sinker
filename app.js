const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const { initializeDatabase, closeDatabase } = require('./src/config/database');
const { setupMiddleware } = require('./src/config/middleware');

// Import route modules
const webhookRoutes = require('./src/routes/webhooks');
const promptRoutes = require('./src/routes/prompts');
const claudeRoutes = require('./src/routes/claude');
const pageRoutes = require('./src/routes/pages');

const app = express();
const PORT = 4665; // HOOK on phone keypad

// Setup middleware
setupMiddleware(app);

// Swagger API documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Mount routes
app.use('/', webhookRoutes);
app.use('/', promptRoutes);
app.use('/', claudeRoutes);
app.use('/', pageRoutes);

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    console.log('Database initialized successfully');
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🎣 Hook Line Sinker server listening on port ${PORT}`);
      console.log(`📊 Dashboard: http://localhost:${PORT}/`);
      console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook`);
      console.log(`📝 Prompt editor: http://localhost:${PORT}/prompts`);
      console.log(`📖 Events reference: http://localhost:${PORT}/events`);
      console.log(`📚 API docs: http://localhost:${PORT}/api-docs`);
      console.log(`🏥 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  try {
    await closeDatabase();
    console.log('Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  try {
    await closeDatabase();
    console.log('Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start the server
startServer();