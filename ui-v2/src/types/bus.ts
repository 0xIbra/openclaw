export type BusMessageState = "pending" | "leased" | "acked" | "expired" | "dead_letter";

export type BusMessageDto = {
  id: string;
  senderAgentId: string;
  receiverAgentId: string;
  taskId: string | null;
  correlationId: string | null;
  replyToMessageId: string | null;
  messageType: string;
  subject: string | null;
  body: string;
  payload: Record<string, unknown>;
  dedupeKey: string | null;
  state: BusMessageState;
  deliveryCount: number;
  maxDeliveries: number;
  createdAtMs: number;
  availableAtMs: number;
  leasedAtMs: number | null;
  leaseExpiresAtMs: number | null;
  ackedAtMs: number | null;
  expiresAtMs: number | null;
};

export type BusMessageEventPayload = {
  messageId: string;
  receiverAgentId: string;
  messageType: string;
  taskId: string | null;
  createdAtMs: number;
  deliveryCount: number;
};

// UI-level record: fetched full message merged with event metadata
export type BusMessageRecord = BusMessageDto & {
  _fetchedAtMs: number;
};
