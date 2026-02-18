export type QueueMode =
  | "steer"
  | "followup"
  | "collect"
  | "steer-backlog"
  | "steer+backlog"
  | "queue"
  | "interrupt";
export type QueueDropPolicy = "old" | "new" | "summarize";

export type QueueModeByProvider = {
  telegram?: QueueMode;
  discord?: QueueMode;
  irc?: QueueMode;
  googlechat?: QueueMode;
  msteams?: QueueMode;
  webchat?: QueueMode;
};
