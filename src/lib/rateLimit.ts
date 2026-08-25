/**
 * In-memory fixed-window rate limiter: each key gets a counter that resets
 * every `windowMs`; up to `limit` requests are allowed per window.
 *
 * NOTE: On serverless (Vercel), each function instance has its own memory, so
 * this limiter is per-instance, not globally shared across all instances. For
 * strict global rate limiting at scale, back this with Redis/Upstash. For a
 * hackathon / single-region deployment this is sufficient and adds no external
 * dependencies.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

// Hard cap on tracked keys: prevents memory-exhaustion DoS via floods of
// unique (possibly spoofed) keys between eviction sweeps. Oldest-inserted
// keys are evicted first (FIFO approximation of LRU — sufficient here since
// every hit refreshes recency of the bucket's window anyway).
const MAX_BUCKETS = 10_000;

// Evict stale entries every 5 minutes to prevent unbounded memory growth.
// The threshold assumes a single window length across callers (true today —
// every proxy rule uses 60s); with mixed windows, whichever caller triggers
// the sweep decides how stale "stale" is.
let lastEviction = Date.now();
const EVICT_INTERVAL_MS = 5 * 60 * 1000;

function evictStale(windowMs: number) {
  const now = Date.now();
  if (now - lastEviction < EVICT_INTERVAL_MS) return;
  lastEviction = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > windowMs * 2) {
      buckets.delete(key);
    }
  }
}

function insertWithCap(key: string, bucket: Bucket) {
  while (buckets.size >= MAX_BUCKETS) {
    // Map preserves insertion order; drop the oldest entry.
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
  buckets.set(key, bucket);
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // seconds until window resets
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  // Fail closed on nonsensical config: limit < 1 would let the first request
  // through with remaining: -1, and windowMs < 1 would reset the window on
  // every call (i.e. no limiting at all).
  if (
    !Number.isFinite(limit) || limit < 1 ||
    !Number.isFinite(windowMs) || windowMs < 1
  ) {
    return { allowed: false, remaining: 0, retryAfter: 60 };
  }

  evictStale(windowMs);
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    // Refresh position for existing keys too (cheap LRU touch).
    if (bucket) buckets.delete(key);
    insertWithCap(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    const retryAfter = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfter: 0 };
}

/**
 * Extract the best available client identifier from request headers.
 *
 * Preference order:
 *  1. `x-vercel-forwarded-for` — written by Vercel's edge under the reserved
 *     `x-vercel-*` namespace, which strips client-supplied values, so it
 *     cannot be spoofed by the requester.
 *  2. The LAST entry of `x-forwarded-for` — earlier entries are
 *     client-controlled and trivially spoofable; the rightmost hop was
 *     appended by the proxy closest to us.
 *  3. `x-real-ip` — deliberately checked last: it is not a Vercel-managed
 *     header, so a client can send an arbitrary value and rotating it would
 *     give each request a fresh rate-limit bucket. It remains useful when
 *     self-hosting behind a reverse proxy that sets it.
 */
export function getClientKey(request: Request): string {
  const vercelFwd = request.headers.get("x-vercel-forwarded-for");
  if (vercelFwd && vercelFwd.trim()) {
    const parts = vercelFwd.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[0];
  }

  const fwd = request.headers.get("x-forwarded-for");
  if (fwd && fwd.trim()) {
    const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]; // rightmost = closest to our proxy
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.split(",")[0].trim();

  return "unknown";
}
