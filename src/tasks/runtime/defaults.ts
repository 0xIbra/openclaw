export const TASK_WORKER_IDLE_POLL_MS = 3_000;
export const TASK_WORKER_LEASE_DURATION_MS = 45_000;
export const TASK_WORKER_HEARTBEAT_MS = 15_000;
export const TASK_WORKER_MAX_BACKOFF_MS = 30_000;
export const TASK_WORKER_RECONCILE_MS = 10_000;
export const TASK_WORKER_EXECUTION_TIMEOUT_MS = 20 * 60_000;

// Phase 3: Supervision & Resilience defaults
export const TASK_WORKER_MAX_MEMORY_MB = 2048; // 2GB default memory limit
export const TASK_WORKER_MEMORY_CHECK_INTERVAL_MS = 30_000; // Check memory every 30s
export const TASK_WORKER_MAX_CONSECUTIVE_ERRORS = 5; // Auto-restart after 5 consecutive errors
export const TASK_WORKER_ERROR_RESET_INTERVAL_MS = 300_000; // Reset error streak after 5min of success
export const TASK_WORKER_HEALTH_PROBE_INTERVAL_MS = 10_000; // Health check interval
export const TASK_WORKER_UNHEALTHY_THRESHOLD_MS = 60_000; // Mark unhealthy after 60s no heartbeat

export const TASK_LEAD_POLL_MS = 3_000;
export const TASK_LEAD_MESSAGE_VISIBILITY_TIMEOUT_MS = 30_000;
export const TASK_LEAD_QUESTION_REMINDER_MS = 120_000;
export const TASK_LEAD_QUESTION_ESCALATION_MS = 600_000;
export const TASK_LEAD_RECONCILE_MS = 10_000;
