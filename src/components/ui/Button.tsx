"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-frost text-void hover:bg-frost/80",
  secondary: "bg-surface-1 border border-frost/20 text-bone hover:bg-surface-2 hover:border-frost/30",
  ghost: "bg-transparent text-bone hover:bg-surface-1",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-caption",
  md: "px-4 py-2 text-body",
  lg: "px-6 py-3 text-label",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading = false, fullWidth = false, disabled, className = "", children, ...props }, ref) => {
    const isDisabled = disabled || loading;
    
    return (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        aria-busy={loading}
        className={`
          inline-flex items-center justify-center gap-2 font-mono font-medium tracking-[-0.02em]
          rounded-sm transition-default
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bone
          disabled:opacity-40 disabled:cursor-not-allowed
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${fullWidth ? "w-full" : ""}
          ${className}
        `}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";