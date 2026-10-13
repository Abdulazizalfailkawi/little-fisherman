// Tiny in-memory rate limiter (per server instance). It is a speed bump against
// someone hammering a public endpoint, not a replacement for a firewall.

const hits = new Map<string, number[]>();

export function clientIp(req: Request): string {
  const f = req.headers.get("x-forwarded-for");
  return (f ? f.split(",")[0] : req.headers.get("x-real-ip") ?? "unknown").trim();
}

/** true when the caller is over `max` requests in `windowMs`. */
export function limited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return list.length > max;
}
