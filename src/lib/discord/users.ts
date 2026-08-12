import { config } from "@lib/config.js";

import type { GuildMember } from "discord.js";

export function getClientIDFromToken(token: string): string {
  return atob(token.split(".")[0]);
}

// A member is part of the Coder team if they hold the configured team role.
// Everyone else is treated as a community member.
export function isTeamMember(member: GuildMember): boolean {
  return member.roles.cache.has(config.teamRoleId);
}
