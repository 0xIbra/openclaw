import type { OpenClawConfig } from "../../config/types.js";
import type { ChannelDirectoryEntry } from "./types.js";
import { resolveDiscordAccount } from "../../discord/accounts.js";
import { resolveTelegramAccount } from "../../telegram/accounts.js";

export type DirectoryConfigParams = {
  cfg: OpenClawConfig;
  accountId?: string | null;
  query?: string | null;
  limit?: number | null;
};

function addAllowFromAndDmsIds(
  ids: Set<string>,
  allowFrom: readonly unknown[] | undefined,
  dms: Record<string, unknown> | undefined,
) {
  for (const entry of allowFrom ?? []) {
    const raw = String(entry).trim();
    if (!raw || raw === "*") {
      continue;
    }
    ids.add(raw);
  }
  for (const id of Object.keys(dms ?? {})) {
    const trimmed = id.trim();
    if (trimmed) {
      ids.add(trimmed);
    }
  }
}

export async function listSlackDirectoryPeersFromConfig(
  _params: DirectoryConfigParams,
): Promise<ChannelDirectoryEntry[]> {
  return [];
}

export async function listSlackDirectoryGroupsFromConfig(
  _params: DirectoryConfigParams,
): Promise<ChannelDirectoryEntry[]> {
  return [];
}

export async function listDiscordDirectoryPeersFromConfig(
  params: DirectoryConfigParams,
): Promise<ChannelDirectoryEntry[]> {
  const account = resolveDiscordAccount({ cfg: params.cfg, accountId: params.accountId });
  const q = params.query?.trim().toLowerCase() || "";
  const ids = new Set<string>();

  addAllowFromAndDmsIds(
    ids,
    account.config.allowFrom ?? account.config.dm?.allowFrom,
    account.config.dms,
  );
  for (const guild of Object.values(account.config.guilds ?? {})) {
    for (const entry of guild.users ?? []) {
      const raw = String(entry).trim();
      if (raw) {
        ids.add(raw);
      }
    }
    for (const channel of Object.values(guild.channels ?? {})) {
      for (const user of channel.users ?? []) {
        const raw = String(user).trim();
        if (raw) {
          ids.add(raw);
        }
      }
    }
  }

  return Array.from(ids)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const mention = raw.match(/^<@!?(\d+)>$/);
      const cleaned = (mention?.[1] ?? raw).replace(/^(discord|user):/i, "").trim();
      if (!/^\d+$/.test(cleaned)) {
        return null;
      }
      return `user:${cleaned}`;
    })
    .filter((id): id is string => Boolean(id))
    .filter((id) => (q ? id.toLowerCase().includes(q) : true))
    .slice(0, params.limit && params.limit > 0 ? params.limit : undefined)
    .map((id) => ({ kind: "user", id }) as const);
}

export async function listDiscordDirectoryGroupsFromConfig(
  params: DirectoryConfigParams,
): Promise<ChannelDirectoryEntry[]> {
  const account = resolveDiscordAccount({ cfg: params.cfg, accountId: params.accountId });
  const q = params.query?.trim().toLowerCase() || "";
  const ids = new Set<string>();
  for (const guild of Object.values(account.config.guilds ?? {})) {
    for (const channelId of Object.keys(guild.channels ?? {})) {
      const trimmed = channelId.trim();
      if (trimmed) {
        ids.add(trimmed);
      }
    }
  }

  return Array.from(ids)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const mention = raw.match(/^<#(\d+)>$/);
      const cleaned = (mention?.[1] ?? raw).replace(/^(discord|channel|group):/i, "").trim();
      if (!/^\d+$/.test(cleaned)) {
        return null;
      }
      return `channel:${cleaned}`;
    })
    .filter((id): id is string => Boolean(id))
    .filter((id) => (q ? id.toLowerCase().includes(q) : true))
    .slice(0, params.limit && params.limit > 0 ? params.limit : undefined)
    .map((id) => ({ kind: "group", id }) as const);
}

export async function listTelegramDirectoryPeersFromConfig(
  params: DirectoryConfigParams,
): Promise<ChannelDirectoryEntry[]> {
  const account = resolveTelegramAccount({ cfg: params.cfg, accountId: params.accountId });
  const q = params.query?.trim().toLowerCase() || "";
  const raw = [
    ...(account.config.allowFrom ?? []).map((entry) => String(entry)),
    ...Object.keys(account.config.dms ?? {}),
  ];
  return Array.from(
    new Set(
      raw
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/^(telegram|tg):/i, "")),
    ),
  )
    .map((entry) => {
      const trimmed = entry.trim();
      if (!trimmed) {
        return null;
      }
      if (/^-?\d+$/.test(trimmed)) {
        return trimmed;
      }
      const withAt = trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
      return withAt;
    })
    .filter((id): id is string => Boolean(id))
    .filter((id) => (q ? id.toLowerCase().includes(q) : true))
    .slice(0, params.limit && params.limit > 0 ? params.limit : undefined)
    .map((id) => ({ kind: "user", id }) as const);
}

export async function listTelegramDirectoryGroupsFromConfig(
  params: DirectoryConfigParams,
): Promise<ChannelDirectoryEntry[]> {
  const account = resolveTelegramAccount({ cfg: params.cfg, accountId: params.accountId });
  const q = params.query?.trim().toLowerCase() || "";
  return Object.keys(account.config.groups ?? {})
    .map((id) => id.trim())
    .filter((id) => Boolean(id) && id !== "*")
    .filter((id) => (q ? id.toLowerCase().includes(q) : true))
    .slice(0, params.limit && params.limit > 0 ? params.limit : undefined)
    .map((id) => ({ kind: "group", id }) as const);
}

export async function listWhatsAppDirectoryPeersFromConfig(
  _params: DirectoryConfigParams,
): Promise<ChannelDirectoryEntry[]> {
  return [];
}

export async function listWhatsAppDirectoryGroupsFromConfig(
  _params: DirectoryConfigParams,
): Promise<ChannelDirectoryEntry[]> {
  return [];
}
