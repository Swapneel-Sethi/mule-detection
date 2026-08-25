/**
 * In-memory fixed-window rate limiter: each key gets a counter that resets
 * every `windowMs`; up to `limit` requests are allowed per window.
 *
 * NOTE: On serverless (Vercel), each function instance has its own memory, so
 * this limiter is per-instance, not globally shared across all instances: N
 * instances give N× the configured budget, and every cold start resets all
 * counters. For strict global rate limiting at scale, back this with
 * Redis/Upstash. For a hackathon / single-region deployment this is
 * sufficient and adds no external dependencies.
 */

interface Bucket {
  count: number;
  windowStart: number;
  lastHit: number;
}

const buckets = new Map<string, Bucket>();

// Hard cap on tracked keys: prevents memory-exhaustion DoS via floods of
// unique (possibly spoofed) keys between eviction sweeps. When the cap is
// hit, the least-recently-hit key is evicted (true LRU), so an active
// mid-window bucket is never discarded in favor of a stale one.
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
    // Evict the least-recently-hit entry. FIFO (insertion-order head) would
    // evict ACTIVE mid-window buckets during a unique-key flood, silently
    // resetting their counters and turning the limiter into a pass-through.
    let lruKey: string | undefined;
    let lruHit = Infinity;
    for (const [k, b] of buckets) {
      if (b.lastHit < lruHit) {
        lruKey = k;
        lruHit = b.lastHit;
      }
    }
    if (lruKey === undefined) break;
    buckets.delete(lruKey);
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
    insertWithCap(key, { count: 1, windowStart: now, lastHit: now });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    const retryAfter = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  // Touch recency on EVERY hit (not just window resets): delete+set refreshes
  // the Map's insertion order, so LRU eviction cannot discard an actively
  // consuming bucket in favor of a stale one. Deleting first keeps size under
  // MAX_BUCKETS, so insertWithCap's eviction loop stays idle on this path.
  buckets.delete(key);
  bucket.lastHit = now;
  buckets.set(key, bucket);
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfter: 0 };
}

// Forwarded headers are only as trustworthy as the edge that wrote them.
// Vercel's edge overwrites `x-forwarded-for`/`x-real-ip` platform-side, and a
// reverse proxy configured to strip client-supplied values does the same.
// Anywhere else (`next start`, plain Docker, ...) these headers arrive fully
// attacker-controlled, so they are ignored unless the operator opts in with
// TRUST_PROXY=true.
const TRUST_PROXY = process.env.TRUST_PROXY === "true";

// Structural gate (not full RFC parsing): rejects junk like `<script>` or
// arbitrary tokens before anything is used as a rate-limit key.
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

function isIp(value: string): boolean {
  if (IPV4_RE.test(value)) {
    return value.split(".").every((octet) => Number(octet) <= 255);
  }
  // IPv6 (incl. IPv4-mapped tails): hex groups and colons only, bounded length.
  return (
    /^[0-9A-Fa-f:.]+$/.test(value) && value.includes(":") && value.length <= 45
  );
}

// Warn once per distinct bad value (capped set) so an attacker cannot flood
// the logs by rotating garbage header values.
const warnedHeaderValues = new Set<string>();

function rejectNonIp(header: string, value: string) {
  if (!warnedHeaderValues.has(value) && warnedHeaderValues.size < 100) {
    warnedHeaderValues.add(value);
    console.warn(
      `[rateLimit] ignoring non-IP value from ${header}: ${value.slice(0, 64)}`
    );
  }
}

// Coarse fallback identity for clients we cannot attribute to an IP: hash of
// the User-Agent. Spoofable by design — its only job is to isolate anonymous
// callers from each other and from identified IPs, never to grant trust.
// proxy.ts applies a far smaller budget to these keys.
function anonFallback(request: Request): string {
  const ua = request.headers.get("user-agent") ?? "";
  let hash = 0x811c9dc5;
  for (let i = 0; i < ua.length; i++) {
    hash ^= ua.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `anon:${(hash >>> 0).toString(36)}`;
}

/**
 * Extract the best available client identifier from request headers.
 *
 * Without TRUST_PROXY=true, every forwarded header is attacker-controllable,
 * so callers get an `anon:` User-Agent fingerprint instead (see proxy.ts for
 * the reduced budget applied to those).
 *
 * With TRUST_PROXY=true, preference order:
 *  1. The LAST entry of `x-forwarded-for` — earlier entries are appended by
 *     proxies closest to the client; only the rightmost hop was written by
 *     the proxy closest to us. On Vercel this header is overwritten by the
 *     edge, making rightmost the true client IP (`x-vercel-forwarded-for`
 *     carries the identical value, so it is not consulted separately).
 *  2. `x-real-ip` — also platform-set on Vercel; useful behind a reverse
 *     proxy that sets it instead of XFF.
 *
 * Values failing IP syntax validation are skipped and logged (warn-once per
 * distinct value); if nothing valid remains, the caller falls back to `anon:`.
 */
export function getClientKey(request: Request): string {
  if (TRUST_PROXY) {
    const fwd = request.headers.get("x-forwarded-for");
    if (fwd) {
      const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
      const rightmost = parts[parts.length - 1];
      if (rightmost) {
        if (isIp(rightmost)) return rightmost;
        rejectNonIp("x-forwarded-for", rightmost);
      }
    }

    const realIp = request.headers.get("x-real-ip");
    if (realIp) {
      const candidate = realIp.split(",")[0].trim();
      if (candidate) {
        if (isIp(candidate)) return candidate;
        rejectNonIp("x-real-ip", candidate);
      }
    }
  }

  return anonFallback(request);
}

/**
 * True when getClientKey produced a trusted IP identity rather than an
 * `anon:` fingerprint; proxy.ts uses this to pick the applicable budget.
 */
export function isIdentifiedClient(key: string): boolean {
  return !key.startsWith("anon:");
}
