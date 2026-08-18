/**
 * In-memory sliding-window rate limiter.
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

// Evict stale entries every 5 minutes to prevent unbounded memory growth
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
  evictStale(windowMs);
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    const retryAfter = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfter: 0 };
}

/** Extract a stable client identifier from request headers. */
export function getClientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : "unknown";
  return ip;
}
