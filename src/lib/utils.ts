/**
 * Formatting utilities.
 *
 * Locale-sensitive helpers are pinned to "en-IN" at the call site — there is
 * deliberately no runtime locale plumbing (setUserLocale/getUserLocale were
 * removed as unused: nothing ever called setUserLocale, and getUserLocale's
 * navigator read caused SSR/client hydration mismatches, so its remaining
 * callers pinned their own locale anyway).
 *
 * Generic exports (formatNumber/formatPercent/formatDate/formatBytes/truncate,
 * …) were deleted under the zero-usages finding — duplicated inline helpers
 * grew precisely because these sat unconsumed here. Re-add a generic helper
 * only when a second consumer appears alongside its first real call site.
 */

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

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
