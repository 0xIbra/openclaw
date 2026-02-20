import type { GatewayBrowserClient } from "../gateway.ts";
import type { TeamsListResult } from "../types.ts";

export type TeamsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  teamsLoading: boolean;
  teamsError: string | null;
  teamsList: TeamsListResult | null;
};

export async function loadTeams(state: TeamsState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.teamsLoading) {
    return;
  }
  state.teamsLoading = true;
  state.teamsError = null;
  try {
    const result = await state.client.request<TeamsListResult>("teams.list", {});
    state.teamsList = result ?? null;
  } catch (err) {
    state.teamsError = err instanceof Error ? err.message : String(err);
  } finally {
    state.teamsLoading = false;
  }
}
