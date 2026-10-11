function whole(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function remainingRequests(used: number, limit: number): number {
  return Math.max(0, whole(limit) - whole(used));
}

export function canSendRequest(used: number, limit: number): boolean {
  return remainingRequests(used, limit) > 0;
}

export function consumeRequest(
  used: number,
  limit: number,
): { ok: true; used: number; remaining: number } | { ok: false; used: number; remaining: number } {
  const current = whole(used);
  const cap = whole(limit);
  if (current >= cap) {
    return { ok: false, used: current, remaining: 0 };
  }
  const next = current + 1;
  return { ok: true, used: next, remaining: Math.max(0, cap - next) };
}
