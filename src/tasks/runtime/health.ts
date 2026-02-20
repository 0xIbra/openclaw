/**
 * Task Runtime Health Module
 *
 * Health monitoring, memory watchdog, and consecutive error tracking for workers.
 */

import type { TaskWorkerStatus } from "./types.js";

export type HealthMonitorOptions = {
  maxMemoryMb: number;
  checkIntervalMs: number;
  maxConsecutiveErrors: number;
  errorResetIntervalMs: number;
  onMemoryLimit?: () => void;
  onConsecutiveErrors?: () => void;
  onHealthCheck?: (status: TaskWorkerStatus) => void;
};

export type HealthMonitor = {
  start: () => void;
  stop: () => void;
  checkMemory: () => { usageMb: number; exceeded: boolean };
  recordSuccess: () => void;
  recordError: (error: string) => { shouldRestart: boolean };
  getStatus: () => Pick<
    TaskWorkerStatus,
    | "memoryUsageMb"
    | "maxMemoryMb"
    | "lastHealthCheckAtMs"
    | "consecutiveErrors"
    | "lastSuccessfulTaskAtMs"
  >;
};

/**
 * Get current memory usage in MB
 */
function getMemoryUsageMb(): number {
  if (typeof process !== "undefined" && process.memoryUsage) {
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024);
  }
  return 0;
}

/**
 * Create a health monitor for a worker
 */
export function createHealthMonitor(options: HealthMonitorOptions): HealthMonitor {
  let memoryUsageMb = 0;
  let lastHealthCheckAtMs: number | null = null;
  let consecutiveErrors = 0;
  let lastSuccessfulTaskAtMs: number | null = null;
  let checkTimer: ReturnType<typeof setInterval> | null = null;
  let lastErrorAtMs: number | null = null;

  const checkMemory = (): { usageMb: number; exceeded: boolean } => {
    memoryUsageMb = getMemoryUsageMb();
    lastHealthCheckAtMs = Date.now();
    const exceeded = memoryUsageMb > options.maxMemoryMb;
    if (exceeded && options.onMemoryLimit) {
      options.onMemoryLimit();
    }
    return { usageMb: memoryUsageMb, exceeded };
  };

  const recordSuccess = (): void => {
    consecutiveErrors = 0;
    lastSuccessfulTaskAtMs = Date.now();
    lastErrorAtMs = null;
  };

  const recordError = (_error: string): { shouldRestart: boolean } => {
    const now = Date.now();

    // Reset error streak if enough time has passed since last success
    if (lastSuccessfulTaskAtMs && now - lastSuccessfulTaskAtMs > options.errorResetIntervalMs) {
      consecutiveErrors = 0;
    }

    // Reset if enough time has passed since last error
    if (lastErrorAtMs && now - lastErrorAtMs > options.errorResetIntervalMs) {
      consecutiveErrors = 0;
    }

    consecutiveErrors++;
    lastErrorAtMs = now;

    const shouldRestart = consecutiveErrors >= options.maxConsecutiveErrors;
    if (shouldRestart && options.onConsecutiveErrors) {
      options.onConsecutiveErrors();
    }

    return { shouldRestart };
  };

  const getStatus = () => ({
    memoryUsageMb,
    maxMemoryMb: options.maxMemoryMb,
    lastHealthCheckAtMs,
    consecutiveErrors,
    lastSuccessfulTaskAtMs,
  });

  return {
    start: () => {
      if (checkTimer) {
        return;
      }
      checkTimer = setInterval(() => {
        const result = checkMemory();
        if (options.onHealthCheck) {
          options.onHealthCheck({
            ...getStatus(),
            agentId: "",
            teamIds: [],
            state: result.exceeded ? "unhealthy" : "idle",
            currentTaskId: null,
            lastHeartbeatAtMs: null,
            errorStreak: 0,
            lastError: null,
            updatedAtMs: Date.now(),
          });
        }
      }, options.checkIntervalMs);
      checkTimer.unref?.();
    },
    stop: () => {
      if (checkTimer) {
        clearInterval(checkTimer);
        checkTimer = null;
      }
    },
    checkMemory,
    recordSuccess,
    recordError,
    getStatus,
  };
}

/**
 * Check if a worker is healthy based on its status
 */
export function isWorkerHealthy(
  status: TaskWorkerStatus,
  options: { maxMemoryMb?: number; unhealthyThresholdMs?: number } = {},
): boolean {
  // Check memory limit
  if (status.memoryUsageMb && status.maxMemoryMb && status.memoryUsageMb > status.maxMemoryMb) {
    return false;
  }

  // Check consecutive errors
  if (status.consecutiveErrors && status.consecutiveErrors >= 5) {
    return false;
  }

  // Check if heartbeat is stale
  if (status.lastHeartbeatAtMs) {
    const staleThreshold = options.unhealthyThresholdMs ?? 60_000;
    if (Date.now() - status.lastHeartbeatAtMs > staleThreshold) {
      return false;
    }
  }

  return true;
}
