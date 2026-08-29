"use client";

import { ReactNode, useState, useEffect } from "react";

/**
 * ImageToast - A toast notification component with an image, following the
 * IRONFORGE design system using the project's design tokens.
 *
 * @param props - ImageToast properties
 * @param props.image - URL or path to the image to display
 * @param props.title - Optional title text for the toast
 * @param props.description - Optional description/body text
 * @param props.variant - Visual variant: "info", "success", "warning", "error"
 * @param props.duration - Auto-dismiss duration in ms (0 = manual only)
 * @param props.onClose - Optional close callback
 * @param props.className - Additional CSS classes
 */
interface ImageToastProps {
  image: string;
  title?: string;
  description?: string;
  variant: "info" | "success" | "warning" | "error";
  duration?: number;
  onClose?: () => void;
  className?: string;
}

const variantStyles: Record<ImageToastProps["variant"], string> = {
  info: "border-bone/20 text-bone",
  success: "border-risk-low bg-risk-low/10 text-risk-low",
  warning: "border-risk-high bg-risk-high/10 text-risk-high",
  error: "border-risk-critical bg-risk-critical/10 text-risk-critical",
};

const variantBg: Record<ImageToastProps["variant"], string> = {
  info: "bg-void",
  success: "bg-risk-low/10",
  warning: "bg-risk-high/10",
  error: "bg-risk-critical/10",
};

const variantBorder: Record<ImageToastProps["variant"], string> = {
  info: "border-bone/20",
  success: "border-risk-low/20",
  warning: "border-risk-high/20",
  error: "border-risk-critical/20",
};

export default function ImageToast({
  image,
  title,
  description,
  variant = "info",
  duration = 5000,
  onClose,
  className = "",
}: ImageToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [hasTimedOut, setHasTimedOut] = useState(false);

  // Auto-dismiss after duration
  useEffect(() => {
    if (duration > 0 && isVisible) {
      const timer = setTimeout(() => {
        setHasTimedOut(true);
        setIsVisible(false);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, isVisible]);

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };

  if (!isVisible || hasTimedOut) {
    return null;
  }

  const styleClasses = `
    fixed top-4 right-4 flex flex-col items-end gap-2 z-50 max-w-xs w-full
    ${variantBorder[variant]} rounded-lg shadow-xl transition-all duration-300
    ${className}
  `;

  const titleClass = `font-mono text-heading-sm font-medium text-bone mb-1`;
  const descClass = `font-mono text-caption text-ash truncated`;
  const toastBg = variantBg[variant];

  return (
    <div
      className={styleClasses}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="relative w-full p-4 ${toastBg}">
        {/* Image section */}
        <img
          src={image}
          alt={title || "Image notification"}
          className="h-12 w-12 object-cover rounded-md mb-3"
          loading="lazy"
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {title && (
            <p className={titleClass}>{title}</p>
          )}
          {description && (
            <p className={descClass}>{description}</p>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-2 top-2 rounded-full p-1 hover:bg-charcoal/10 transition-colors"
          aria-label="Close toast"
        >
          <svg
            className="h-4 w-4 text-ash"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * ImageToastGroup - A group of toasts that automatically manages Z-index and
 * stacking order following the IRONFORGE design system.
 */
export function ImageToastGroup({
  toasts,
  className,
}: {
  toasts: Array<{
    key: string;
    image: string;
    title?: string;
    description?: string;
    variant?: ImageToastProps["variant"];
    duration?: number;
    onClose?: () => void;
  }>;
  className?: string;
}) {
  return (
    <div className={`fixed top-4 right-4 z-50 flex flex-col items-end gap-4 ${className}`}>
      {toasts.map((toast) => (
        <ImageToast
          key={toast.key}
          image={toast.image}
          title={toast.title}
          description={toast.description}
          variant={toast.variant ?? "info"}
          duration={toast.duration}
          onClose={toast.onClose}
        />
      ))}
    </div>
  );
}