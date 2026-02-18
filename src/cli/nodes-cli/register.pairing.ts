import type { Command } from "commander";
import type { NodesRpcOpts } from "./types.js";
import { defaultRuntime } from "../../runtime.js";
import { getNodesTheme, runNodesCommand } from "./cli-utils.js";
import { parsePairingList } from "./format.js";
import { renderPendingPairingRequestsTable } from "./pairing-render.js";
import { callGatewayCli, nodesCallOpts } from "./rpc.js";

export function registerNodesPairingCommands(nodes: Command): void {
  const pairing = nodes.command("pairing").description("Manage node pairing requests");

  nodesCallOpts(
    pairing
      .command("pending")
      .description("Show pending node pairing requests")
      .action(async (opts: NodesRpcOpts) => {
        await runNodesCommand("pairing pending", async () => {
          const result = await callGatewayCli("node.pair.list", opts, {});
          const { pending } = parsePairingList(result);
          if (opts.json) {
            defaultRuntime.log(JSON.stringify({ pending }, null, 2));
            return;
          }
          const { heading, muted, warn } = getNodesTheme();
          const tableWidth = Math.max(60, (process.stdout.columns ?? 120) - 1);
          const rendered = renderPendingPairingRequestsTable({
            pending,
            now: Date.now(),
            tableWidth,
            theme: { heading, muted, warn },
          });
          defaultRuntime.log(rendered.heading);
          defaultRuntime.log(rendered.table);
        });
      }),
  );

  nodesCallOpts(
    pairing
      .command("approve")
      .description("Approve a pending node pairing request")
      .requiredOption("--request <id>", "Pairing request id")
      .action(async (opts: NodesRpcOpts & { request: string }) => {
        await runNodesCommand("pairing approve", async () => {
          const requestId = String(opts.request ?? "").trim();
          if (!requestId) {
            throw new Error("--request is required");
          }
          const result = await callGatewayCli("node.pair.approve", opts, { requestId });
          if (opts.json) {
            defaultRuntime.log(JSON.stringify(result, null, 2));
            return;
          }
          defaultRuntime.log(`Approved node pairing request ${requestId}.`);
        });
      }),
  );

  nodesCallOpts(
    pairing
      .command("reject")
      .description("Reject a pending node pairing request")
      .requiredOption("--request <id>", "Pairing request id")
      .action(async (opts: NodesRpcOpts & { request: string }) => {
        await runNodesCommand("pairing reject", async () => {
          const requestId = String(opts.request ?? "").trim();
          if (!requestId) {
            throw new Error("--request is required");
          }
          const result = await callGatewayCli("node.pair.reject", opts, { requestId });
          if (opts.json) {
            defaultRuntime.log(JSON.stringify(result, null, 2));
            return;
          }
          defaultRuntime.log(`Rejected node pairing request ${requestId}.`);
        });
      }),
  );
}
