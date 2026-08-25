/**
 * Internationalization-ready formatting utilities
 * Uses user's locale or falls back to en-US
 */

let userLocale: string | null = null;

export function setUserLocale(locale: string) {
  userLocale = locale;
}

export function getUserLocale(): string {
  if (userLocale) return userLocale;
  if (typeof navigator !== "undefined") return navigator.language || "en-US";
  return "en-US";
}

export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {}
): string {
  const locale = getUserLocale();
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
    ...options,
  }).format(value);
}

export function formatNumberFull(
  value: number,
  options: Intl.NumberFormatOptions = {}
): string {
  const locale = getUserLocale();
  return new Intl.NumberFormat(locale, {
    ...options,
  }).format(value);
}

export function formatCurrency(
  value: number,
  currency = "INR",
  options: Intl.NumberFormatOptions = {}
): string {
  const locale = getUserLocale();
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
    ...options,
  }).format(value);
}

export function formatCurrencyFull(
  value: number,
  currency = "INR",
  options: Intl.NumberFormatOptions = {}
): string {
  const locale = getUserLocale();
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    ...options,
  }).format(value);
}

export function formatCurrencyINR(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "₹0";
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
  return sign + new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(absVal);
}

export function formatPercent(
  value: number,
  options: Intl.NumberFormatOptions = {}
): string {
  const locale = getUserLocale();
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    ...options,
  }).format(value / 100);
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
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(dateObj);
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

  const rtf = new Intl.RelativeTimeFormat(locale, options);

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