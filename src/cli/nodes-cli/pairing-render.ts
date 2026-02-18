/**
 * Stub pairing-render — the full pairing module was removed per SPEC.md.
 */

export function renderPendingPairingRequestsTable(_params: {
  pending: unknown[];
  now: number;
  tableWidth: number;
  theme: {
    heading: (s: string) => string;
    warn: (s: string) => string;
    muted: (s: string) => string;
  };
}): { heading: string; table: string } {
  return { heading: "", table: "" };
}
