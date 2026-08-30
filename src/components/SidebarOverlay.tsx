"use client";

import { useEffect, useRef } from "react";

/**
 * Mobile navigation drawer overlay.
 *
 * Accessibility: when open this is a modal dialog — Esc closes it, Tab is
 * trapped inside (focus wraps between first/last focusable elements), and
 * focus returns to the opener (`#mobile-menu-btn`) on close.
 */
export default function SidebarOverlay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const drawer = document.getElementById("sidebar-drawer");

    // Modal semantics: freeze background scroll while the drawer is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Compensate the removed scrollbar gutter so the page doesn't shift
    // horizontally on platforms with classic (always-visible) scrollbars.
    const previousPaddingRight = document.body.style.paddingRight;
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    if (gutter > 0) document.body.style.paddingRight = `${gutter}px`;

    // Focus the drawer itself so Tab starts inside the trap.
    drawer?.setAttribute("tabindex", "-1");
    (drawer as HTMLElement | null)?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const container = drawer ?? dialogRef.current;
      if (!container) return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );
      // Skip hidden elements (display:none via offsetParent === null), e.g. the
      // lg:hidden close button below lg, whose .focus() would silently no-op.
      const visible = focusables.filter((el) => el.offsetParent !== null);
      const list = visible.length > 0 ? visible : [container as HTMLElement];
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      // Restore focus to the opener when the dialog unmounts/closes.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      } else {
        document.getElementById("mobile-menu-btn")?.focus({ preventScroll: true });
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      id="sidebar-overlay"
      ref={dialogRef}
      className="fixed inset-0 z-40 lg:hidden"
      role="presentation"
      aria-hidden="true"
      onClick={onClose}
      style={{ backgroundColor: 'var(--bg-darker)', opacity: 0.8 }}
    />
  );
}