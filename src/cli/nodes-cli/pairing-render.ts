import type { PendingRequest } from "./types.js";
import { formatTimeAgo } from "../../infra/format-time/format-relative.ts";
import { renderTable } from "../../terminal/table.js";

export function renderPendingPairingRequestsTable(params: {
  pending: PendingRequest[];
  now: number;
  tableWidth: number;
  theme: {
    heading: (s: string) => string;
    warn: (s: string) => string;
    muted: (s: string) => string;
  };
}): { heading: string; table: string } {
  if (params.pending.length === 0) {
    return {
      heading: params.theme.heading("Pending"),
      table: params.theme.muted("(none)"),
    };
  }

  const rows = params.pending.map((entry) => ({
    Request: entry.requestId,
    Node: entry.displayName?.trim() ? entry.displayName.trim() : entry.nodeId,
    ID: entry.nodeId,
    IP: entry.remoteIp ?? "",
    Age:
      typeof entry.ts === "number" ? formatTimeAgo(Math.max(0, params.now - entry.ts)) : "unknown",
    Status: entry.isRepair ? params.theme.warn("repair") : params.theme.muted("new"),
  }));

  return {
    heading: params.theme.heading("Pending"),
    table: renderTable({
      width: params.tableWidth,
      columns: [
        { key: "Request", header: "Request", minWidth: 10 },
        { key: "Node", header: "Node", minWidth: 12, flex: true },
        { key: "ID", header: "ID", minWidth: 10 },
        { key: "IP", header: "IP", minWidth: 10 },
        { key: "Age", header: "Age", minWidth: 10 },
        { key: "Status", header: "Status", minWidth: 8 },
      ],
      rows,
    }).trimEnd(),
  };
}
