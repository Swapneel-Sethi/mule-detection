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
      const list = focusables.length > 0 ? focusables : [container as HTMLElement];
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
      className="fixed inset-0 bg-void/80 z-40 lg:hidden"
      role="presentation"
      aria-hidden="true"
      onClick={onClose}
    />
  );
}
