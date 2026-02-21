import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useGatewayStore } from "@/stores";

type ConnectionGuardProps = {
  children: ReactNode;
};

export function ConnectionGuard({ children }: ConnectionGuardProps) {
  const status = useGatewayStore((s) => s.status);
  const error = useGatewayStore((s) => s.error);

  if (status === "connected") {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 text-center p-8">
      <div className="w-16 h-16 rounded-full border-2 border-tron-cyan/30 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-tron-cyan/50 animate-pulse" />
      </div>
      <div>
        <h2 className="font-display text-xl text-tron-cyan mb-1">
          {status === "connecting" ? "Connecting to Grid..." : "Not Connected"}
        </h2>
        {error && <p className="text-sm text-tron-red">{error}</p>}
        {status === "disconnected" && (
          <p className="text-sm text-tron-muted-fg mt-2">
            Configure your gateway in{" "}
            <Link to="/settings" className="text-tron-cyan hover:underline">
              Settings
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
