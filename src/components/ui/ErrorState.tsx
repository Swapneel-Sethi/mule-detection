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
  // EmptyState's root already carries the correct live-region role (polite
  // "status", or assertive "alert" for variant="error"); wrapping it in
  // another live region risks double announcements.
  return (
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
  );
}

export default ErrorState;