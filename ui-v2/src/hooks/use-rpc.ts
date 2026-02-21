import { useState, useCallback } from "react";
import { useGatewayStore } from "@/stores";

type RpcState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

export function useRpc<T = unknown>(method: string) {
  const [state, setState] = useState<RpcState<T>>({ data: null, loading: false, error: null });

  const execute = useCallback(
    async (params?: unknown): Promise<T | null> => {
      const client = useGatewayStore.getState().client;
      if (!client) {
        setState((s) => ({ ...s, error: "Not connected" }));
        return null;
      }
      setState({ data: null, loading: true, error: null });
      try {
        const result = await client.request<T>(method, params);
        setState({ data: result, loading: false, error: null });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setState({ data: null, loading: false, error: msg });
        return null;
      }
    },
    [method],
  );

  return { ...state, execute };
}
