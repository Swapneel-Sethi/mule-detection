"use client";

import { Button } from "./Button";
import EmptyState from "./EmptyState";

interface ErrorStateProps {
  message?: string;
  description?: string;
  onRetry?: () => void;
}

/** Honest failure state — replaces the old silent mock-data fallback. */
export function ErrorState({
  message = "Failed to load data",
  description,
  onRetry,
}: ErrorStateProps) {
  return (
    <div aria-live="polite">
      <EmptyState
        variant="error"
        message={message}
        description={description}
        action={
          onRetry ? (
            <Button size="sm" onClick={onRetry}>
              Retry
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

export default ErrorState;
