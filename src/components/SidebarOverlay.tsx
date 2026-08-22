"use client";

export default function SidebarOverlay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <div
      id="sidebar-overlay"
      className="fixed inset-0 bg-void/80 z-40 lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
      onClick={onClose}
    />
  );
}