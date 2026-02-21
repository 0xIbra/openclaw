import { useGatewayStore } from "@/stores";

export function useGateway() {
  const client = useGatewayStore((s) => s.client);
  const status = useGatewayStore((s) => s.status);
  const hello = useGatewayStore((s) => s.hello);
  const error = useGatewayStore((s) => s.error);

  return {
    client,
    connected: status === "connected",
    connecting: status === "connecting",
    status,
    hello,
    error,
  };
}
