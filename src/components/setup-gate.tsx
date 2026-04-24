"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { OnboardingWizard } from "@/components/onboarding-wizard";

const SETUP_DONE_KEY = "mc-setup-complete-v1";
const AUTO_RETRY_SECONDS = 8;
const POST_COMPLETE_GRACE_MS = 3000;

/**
 * SetupGate checks whether the user has completed initial setup.
 * On first run (no localStorage flag), it shows the OnboardingWizard.
 * After completion, it stores a flag and renders children normally.
 *
 * This gates the first-run experience behind a new-user flag.
 */
export function SetupGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "needed" | "complete">("checking");
  const completedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const done = localStorage.getItem(SETUP_DONE_KEY);
      if (done === "1") {
        setStatus("complete");
        return;
      }
    } catch {
      // Storage unavailable — skip gate
      setStatus("complete");
      return;
    }
    // No flag found → show setup
    setStatus("needed");
  }, []);

  const handleComplete = useCallback(() => {
    completedRef.current = true;
    try {
      localStorage.setItem(SETUP_DONE_KEY, "1");
    } catch {
      // ignore storage failures
    }
    // Small grace period for any async ops to settle
    setTimeout(() => {
      setStatus("complete");
      setTimeout(() => {
        completedRef.current = false;
      }, 2000);
    }, POST_COMPLETE_GRACE_MS);
  }, []);

  // Loading state
  if (status === "checking") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-mc-bg">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mc-accent/60 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mc-accent/60 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mc-accent/60 [animation-delay:300ms]" />
        </div>
      </div>
    );
  }

  // Setup complete — render app
  if (status === "complete") {
    return <>{children}</>;
  }

  // Setup needed — show wizard
  return <OnboardingWizard onComplete={handleComplete} />;
}