/**
 * Determines whether a message should be routed to Ares.
 */
export function shouldHandleAsAres(message: string): boolean {
  // Explicit Ares mention
  if (/\bares\b/i.test(message)) {
    return true;
  }

  // Team management
  if (
    /\b(team|teams)\b/i.test(message) &&
    /\b(create|make|add|list|show|delete|remove|update|get)\b/i.test(message)
  ) {
    return true;
  }

  // Task management in control context
  if (
    /\b(task|tasks)\b/i.test(message) &&
    /\b(create|assign|give|delegate|list|show|approve|reject)\b/i.test(message)
  ) {
    return true;
  }

  // Project management
  if (/\b(project|projects)\b/i.test(message) && /\b(create|make|add|list|show)\b/i.test(message)) {
    return true;
  }

  // Status/overview
  if (/\b(status|overview|what['']?s\s+(going\s+on|happening))\b/i.test(message)) {
    return true;
  }

  return false;
}
