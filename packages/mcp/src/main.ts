import { startMcpServer } from './server.js';

startMcpServer().catch(error => {
    console.error('[reqlan-mcp] Failed to start:', error);
    process.exit(1);
});
