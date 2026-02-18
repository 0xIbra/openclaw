import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

export const BusMessageStateSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("leased"),
  Type.Literal("acked"),
  Type.Literal("expired"),
  Type.Literal("dead_letter"),
]);

export const BusMessageSchema = Type.Object(
  {
    id: NonEmptyString,
    senderAgentId: NonEmptyString,
    receiverAgentId: NonEmptyString,
    taskId: Type.Union([Type.String(), Type.Null()]),
    messageType: NonEmptyString,
    subject: Type.Union([Type.String(), Type.Null()]),
    body: NonEmptyString,
    payload: Type.Record(Type.String(), Type.Unknown()),
    dedupeKey: Type.Union([Type.String(), Type.Null()]),
    state: BusMessageStateSchema,
    deliveryCount: Type.Integer({ minimum: 0 }),
    maxDeliveries: Type.Integer({ minimum: 1 }),
    createdAtMs: Type.Integer({ minimum: 0 }),
    availableAtMs: Type.Integer({ minimum: 0 }),
    leasedAtMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    leaseExpiresAtMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    ackedAtMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    expiresAtMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  },
  { additionalProperties: false },
);

export const BusPublishParamsSchema = Type.Object(
  {
    senderAgentId: NonEmptyString,
    receiverAgentId: NonEmptyString,
    taskId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    messageType: NonEmptyString,
    subject: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    body: NonEmptyString,
    payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    dedupeKey: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    delayMs: Type.Optional(Type.Integer({ minimum: 0 })),
    ttlMs: Type.Optional(Type.Integer({ minimum: 1 })),
    maxDeliveries: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

export const BusPublishResultSchema = Type.Object(
  {
    messageId: NonEmptyString,
    deduped: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const BusPullParamsSchema = Type.Object(
  {
    receiverAgentId: NonEmptyString,
    maxMessages: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    visibilityTimeoutMs: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

export const BusDeliverySchema = Type.Object(
  {
    message: BusMessageSchema,
    ackToken: NonEmptyString,
  },
  { additionalProperties: false },
);

export const BusPullResultSchema = Type.Object(
  {
    deliveries: Type.Array(BusDeliverySchema),
  },
  { additionalProperties: false },
);

export const BusAckParamsSchema = Type.Object(
  {
    receiverAgentId: NonEmptyString,
    messageId: NonEmptyString,
    ackToken: NonEmptyString,
  },
  { additionalProperties: false },
);

export const BusAckResultSchema = Type.Object(
  {
    message: BusMessageSchema,
  },
  { additionalProperties: false },
);

export const BusMessageEventSchema = Type.Object(
  {
    messageId: NonEmptyString,
    receiverAgentId: NonEmptyString,
    messageType: NonEmptyString,
    taskId: Type.Union([Type.String(), Type.Null()]),
    createdAtMs: Type.Integer({ minimum: 0 }),
    deliveryCount: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
