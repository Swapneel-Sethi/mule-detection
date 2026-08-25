/**
 * Formatting utilities. The locale is pinned unless overridden at runtime via
 * setUserLocale — getUserLocale must never read navigator.language, or SSR
 * markup and first client render disagree (see comment there).
 */

let userLocale: string | null = null;

export function setUserLocale(locale: string) {
  userLocale = locale;
}

// Each Intl.*Format constructor resolves ICU data, and these run per table
// cell and per chart-tooltip mousemove — reuse instances keyed by class +
// locale + serialized options. Call sites pass fresh option literals of
// constant shape, so keys stay stable.
const intlCache = new Map<string, unknown>();

function memoIntl<T>(
  kind: string,
  locale: string,
  options: object,
  create: () => T
): T {
  const key = `${kind}|${locale}|${JSON.stringify(options)}`;
  let cached = intlCache.get(key);
  if (cached === undefined) {
    cached = create();
    intlCache.set(key, cached);
  }
  return cached as T;
}

export function getUserLocale(): string {
  if (userLocale) return userLocale;
  // Pinned rather than navigator.language: SSR prerenders with "en-US" while
  // a browser locale like en-IN renders compact values differently at ≥1e5
  // ("150K" vs "1.5L") — a guaranteed hydration mismatch on any StatCard
  // whose value crosses ₹1L.
  return "en-US";
}

export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {}
): string {
  const locale = getUserLocale();
  const fmtOptions: Intl.NumberFormatOptions = {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
    ...options,
  };
  return memoIntl("NumberFormat", locale, fmtOptions, () => new Intl.NumberFormat(locale, fmtOptions)).format(value);
}

export function formatNumberFull(
  value: number,
  options: Intl.NumberFormatOptions = {}
): string {
  const locale = getUserLocale();
  return memoIntl("NumberFormat", locale, options, () => new Intl.NumberFormat(locale, { ...options })).format(value);
}

export function formatCurrency(
  value: number,
  currency = "INR",
  options: Intl.NumberFormatOptions = {}
): string {
  const locale = getUserLocale();
  const fmtOptions: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
    ...options,
  };
  return memoIntl("NumberFormat", locale, fmtOptions, () => new Intl.NumberFormat(locale, fmtOptions)).format(value);
}

export function formatCurrencyFull(
  value: number,
  currency = "INR",
  options: Intl.NumberFormatOptions = {}
): string {
  const locale = getUserLocale();
  const fmtOptions: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    ...options,
  };
  return memoIntl("NumberFormat", locale, fmtOptions, () => new Intl.NumberFormat(locale, fmtOptions)).format(value);
}

// Fixed arguments — build once instead of per call.
const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatCurrencyINR(value: number): string {
  // Non-finite input is corrupt data — keep it conspicuous ("—") rather than
  // silently rendering "₹0", which falsifies it as a legitimate zero amount.
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "₹0";
  // Negative amounts render as "−₹5.5 Cr", never the broken "₹-5.5 Cr".
  const sign = value < 0 ? "−" : "";
  const absVal = Math.abs(value);
  if (absVal >= 1e7) {
    const cr = absVal / 1e7;
    return `${sign}₹${cr.toFixed(1)} Cr`;
  }
  if (absVal >= 1e5) {
    const lk = absVal / 1e5;
    return `${sign}₹${lk.toFixed(1)} L`;
  }
  // Format the absolute value so the minus glyph matches the U+2212 used by
  // the Cr/L branches instead of Intl's ASCII hyphen.
  return sign + inrFormatter.format(absVal);
}

export function formatPercent(
  value: number,
  options: Intl.NumberFormatOptions = {}
): string {
  const locale = getUserLocale();
  const fmtOptions: Intl.NumberFormatOptions = {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    ...options,
  };
  return memoIntl("NumberFormat", locale, fmtOptions, () => new Intl.NumberFormat(locale, fmtOptions)).format(value / 100);
}

export function formatDate(
  date: Date | string | number,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const locale = getUserLocale();
  const dateObj = date instanceof Date ? date : new Date(date);
  // Invalid input (bad string, out-of-range number) would make Intl.format
  // throw a RangeError — degrade to an empty string instead.
  if (Number.isNaN(dateObj.getTime())) return "";
  const fmtOptions: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  };
  return memoIntl("DateTimeFormat", locale, fmtOptions, () => new Intl.DateTimeFormat(locale, fmtOptions)).format(dateObj);
}

export function formatRelativeTime(
  date: Date | string | number,
  options: Intl.RelativeTimeFormatOptions = { numeric: "auto" }
): string {
  const locale = getUserLocale();
  const dateObj = date instanceof Date ? date : new Date(date);
  // Guard invalid dates before diffing — NaN diffs would fall through every
  // branch below into rtf.format(NaN, …).
  if (Number.isNaN(dateObj.getTime())) return "";
  const now = new Date();
  const diffMs = dateObj.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);

  const rtf = memoIntl(
    "RelativeTimeFormat",
    locale,
    options,
    () => new Intl.RelativeTimeFormat(locale, options)
  );

  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, "second");
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, "hour");
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, "day");
  
  return formatDate(dateObj, { dateStyle: "medium" });
}

export function formatBytes(bytes: number, decimals = 1): string {
  // Non-finite and negative sizes are meaningless here; clamp the unit index
  // so sizes >= 1024 TB don't index past the array ("NaN undefined").
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function truncate(str: string, length: number): string {
  // length <= 0 previously produced "hell…" style garbage via slice(0, -1).
  if (length <= 0) return "";
  if (str.length <= length) return str;
  return str.slice(0, length - 1) + "…";
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}