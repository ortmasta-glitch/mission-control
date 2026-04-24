"use client";

import { useState, useCallback } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Rocket,
  Activity,
  BarChart2,
  FileText,
  Megaphone,
  LayoutGrid,
  Settings,
  Zap,
  Sparkles,
} from "lucide-react";

const POST_ONBOARDING_KEY = "mc-post-onboarding";

type WizardStep = "welcome" | "features" | "tour-prompt" | "done";

const FEATURES = [
  {
    icon: <LayoutGrid className="h-5 w-5" />,
    title: "Dashboard",
    description: "System overview, workspace stats, and quick access to everything.",
  },
  {
    icon: <Rocket className="h-5 w-5" />,
    title: "Autopilot",
    description: "Automated task scheduling, idea generation, and health monitoring.",
  },
  {
    icon: <Activity className="h-5 w-5" />,
    title: "Activity",
    description: "Real-time feed of agent actions, completions, and events.",
  },
  {
    icon: <BarChart2 className="h-5 w-5" />,
    title: "Financial",
    description: "Revenue tracking, cost breakdowns, and financial KPIs.",
  },
  {
    icon: <Megaphone className="h-5 w-5" />,
    title: "Advertising",
    description: "Google Ads management, performance tracking, and budget optimization.",
  },
  {
    icon: <FileText className="h-5 w-5" />,
    title: "Documents",
    description: "Knowledge base, document management, and content library.",
  },
  {
    icon: <Settings className="h-5 w-5" />,
    title: "Settings",
    description: "Configuration, API keys, workspace management, and integrations.",
  },
];

type Props = { onComplete: () => void };

export function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState<WizardStep>("welcome");
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(
    () => new Set(FEATURES.map((f) => f.title))
  );

  const completeOnboarding = useCallback(() => {
    try {
      localStorage.setItem(POST_ONBOARDING_KEY, "1");
    } catch {
      // ignore storage failures
    }
    onComplete();
  }, [onComplete]);

  const toggleFeature = (title: string) => {
    setSelectedFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  // ── Welcome Step ──
  if (step === "welcome") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-mc-bg">
        <div className="mx-4 w-full max-w-lg rounded-2xl border border-mc-border bg-mc-bg-secondary p-8 text-center shadow-2xl">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-mc-accent/15">
            <span className="text-3xl">🦞</span>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-mc-text">
            Welcome to Mission Control
          </h1>
          <p className="mb-8 text-sm leading-relaxed text-mc-text-secondary">
            Your AI agent orchestration hub. Manage tasks, monitor agent activity,
            automate workflows, and keep everything running smoothly — all from one dashboard.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => setStep("features")}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-mc-accent px-6 py-2.5 text-sm font-semibold text-mc-bg transition-colors hover:bg-mc-accent/90"
            >
              <Zap className="h-4 w-4" />
              Get Started
            </button>
            <button
              type="button"
              onClick={completeOnboarding}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-mc-border px-6 py-2.5 text-sm font-medium text-mc-text-secondary transition-colors hover:bg-mc-bg-tertiary hover:text-mc-text"
            >
              Skip setup
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Features Step ──
  if (step === "features") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-mc-bg p-4">
        <div className="w-full max-w-xl rounded-2xl border border-mc-border bg-mc-bg-secondary p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-mc-text">
              What you can do here
            </h2>
            <p className="mt-1 text-sm text-mc-text-secondary">
              Explore the key areas of Mission Control. These will be available in your sidebar.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((feature) => {
              const isSelected = selectedFeatures.has(feature.title);
              return (
                <button
                  key={feature.title}
                  type="button"
                  onClick={() => toggleFeature(feature.title)}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    isSelected
                      ? "border-mc-accent/50 bg-mc-accent/10"
                      : "border-mc-border bg-mc-bg hover:bg-mc-bg-tertiary"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isSelected
                        ? "bg-mc-accent/20 text-mc-accent"
                        : "bg-mc-bg-tertiary text-mc-text-secondary"
                    }`}
                  >
                    {feature.icon}
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-semibold ${
                        isSelected ? "text-mc-text" : "text-mc-text-secondary"
                      }`}
                    >
                      {feature.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-mc-text-secondary">
                      {feature.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep("welcome")}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-mc-text-secondary transition-colors hover:bg-mc-bg-tertiary hover:text-mc-text"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep("tour-prompt")}
              className="inline-flex items-center gap-1 rounded-lg bg-mc-accent px-5 py-2.5 text-sm font-semibold text-mc-bg transition-colors hover:bg-mc-accent/90"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Tour Prompt Step ──
  if (step === "tour-prompt") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-mc-bg">
        <div className="mx-4 w-full max-w-md rounded-2xl border border-mc-border bg-mc-bg-secondary p-8 text-center shadow-2xl">
          <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-mc-accent-green/15">
            <Sparkles className="h-6 w-6 text-mc-accent-green" />
          </div>
          <h2 className="mb-2 text-xl font-bold text-mc-text">
            Take a quick tour?
          </h2>
          <p className="mb-8 text-sm leading-relaxed text-mc-text-secondary">
            We&apos;ll walk you through the main areas of Mission Control so you can find
            everything quickly. Takes about a minute.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => {
                // Mark setup complete and show the tour
                try {
                  localStorage.setItem(POST_ONBOARDING_KEY, "1");
                } catch { /* ignore */ }
                // Clear the tour-done flag so the tour shows
                try {
                  localStorage.removeItem("mc-dashboard-tour-done-v1");
                } catch { /* ignore */ }
                onComplete();
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-mc-accent px-6 py-2.5 text-sm font-semibold text-mc-bg transition-colors hover:bg-mc-accent/90"
            >
              <Sparkles className="h-4 w-4" />
              Yes, show me around
            </button>
            <button
              type="button"
              onClick={completeOnboarding}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-mc-border px-6 py-2.5 text-sm font-medium text-mc-text-secondary transition-colors hover:bg-mc-bg-tertiary hover:text-mc-text"
            >
              <Check className="h-4 w-4" />
              I&apos;ll explore on my own
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Done (shouldn't normally render, but just in case) ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-mc-bg">
      <div className="text-center">
        <div className="mb-4 text-4xl">🦞</div>
        <p className="text-mc-text-secondary">Setting things up…</p>
      </div>
    </div>
  );
}