import { resetAgentStatuses } from "./agent-runner.ts";
import { createWsServer } from "./ws-server.ts";

const PORT = parseInt(process.env.BLACKBOX_PORT ?? "3001", 10);

// On startup, mark all agents as offline (process was restarted)
resetAgentStatuses();

// Start WebSocket + HTTP server
createWsServer(PORT);
