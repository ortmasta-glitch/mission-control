"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

type TourPlacement = "top" | "bottom" | "left" | "right" | "center";

type TourStep = {
  id: string;
  title: string;
  description: string;
  target?: string;
  route?: string;
  placement?: TourPlacement;
};

const TOUR_DONE_KEY = "mc-dashboard-tour-done-v1";
const MIN_DESKTOP_WIDTH = 1024;
const TOUR_PANEL_WIDTH = 360;
const TOUR_PANEL_HEIGHT_ESTIMATE = 250;
const TOUR_GAP = 14;
const TOUR_PAD = 10;

/**
 * Tour steps adapted for our Mission Control navigation.
 * data-tour attributes must be placed on the corresponding elements
 * in the sidebar/header components.
 */
const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Mission Control",
    description:
      "This quick tour shows you where to manage tasks, monitor agents, track finances, and configure your workspace.",
    placement: "center",
  },
  {
    id: "dashboard",
    title: "Your Dashboard",
    description:
      "The home screen gives you an overview of all workspaces, recent activity, and quick access to key areas.",
    target: "[data-tour='nav-dashboard']",
    route: "/",
    placement: "right",
  },
  {
    id: "autopilot",
    title: "Autopilot Mode",
    description:
      "Let your agents work autonomously. Manage idea generation, health scores, scheduling, and content review.",
    target: "[data-tour='nav-autopilot']",
    route: "/autopilot",
    placement: "right",
  },
  {
    id: "activity",
    title: "Live Activity Feed",
    description:
      "Real-time stream of agent actions, task completions, and system events. Keep your finger on the pulse.",
    target: "[data-tour='nav-activity']",
    route: "/activity",
    placement: "right",
  },
  {
    id: "financial",
    title: "Financial Overview",
    description:
      "Revenue tracking, cost breakdowns, and financial KPIs across all your clinics and business lines.",
    target: "[data-tour='nav-financial']",
    route: "/financial",
    placement: "right",
  },
  {
    id: "advertising",
    title: "Advertising & Ads",
    description:
      "Google Ads management, campaign performance, budget tracking, and conversion optimization.",
    target: "[data-tour='nav-advertising']",
    route: "/advertising",
    placement: "right",
  },
  {
    id: "documents",
    title: "Documents & Knowledge",
    description:
      "Upload, parse, and manage documents. Your knowledge base for agents and team.",
    target: "[data-tour='nav-documents']",
    route: "/documents",
    placement: "right",
  },
  {
    id: "reviews",
    title: "Review Management",
    description:
      "Monitor and respond to patient reviews across platforms to maintain your online reputation.",
    target: "[data-tour='nav-reviews']",
    route: "/reviews",
    placement: "right",
  },
  {
    id: "main",
    title: "Main Workspace",
    description:
      "This area displays the content for the selected section. You are all set to explore!",
    target: "[data-tour='main-content']",
    route: "/",
    placement: "bottom",
  },
];

type Rect = { left: number; top: number; width: number; height: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getPanelPosition(
  focusRect: Rect | null,
  placement: TourPlacement,
  viewport: { width: number; height: number }
): React.CSSProperties {
  const cardWidth = Math.min(TOUR_PANEL_WIDTH, Math.max(280, viewport.width - 32));
  if (!focusRect || placement === "center") {
    return {
      width: `${cardWidth}px`,
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  let left = focusRect.left;
  let top = focusRect.top + focusRect.height + TOUR_GAP;

  if (placement === "top") {
    top = focusRect.top - TOUR_PANEL_HEIGHT_ESTIMATE - TOUR_GAP;
  } else if (placement === "left") {
    left = focusRect.left - cardWidth - TOUR_GAP;
    top = focusRect.top;
  } else if (placement === "right") {
    left = focusRect.left + focusRect.width + TOUR_GAP;
    top = focusRect.top;
  }

  left = clamp(left, 16, Math.max(16, viewport.width - cardWidth - 16));
  top = clamp(top, 16, Math.max(16, viewport.height - TOUR_PANEL_HEIGHT_ESTIMATE - 16));

  return {
    width: `${cardWidth}px`,
    left: `${left}px`,
    top: `${top}px`,
  };
}

export function DashboardTour() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const step = TOUR_STEPS[stepIndex];
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  const markDoneAndClose = useCallback(() => {
    try {
      localStorage.setItem(TOUR_DONE_KEY, "1");
    } catch {
      // ignore storage failures
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncViewport = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const alreadyDone = localStorage.getItem(TOUR_DONE_KEY) === "1";
    if (alreadyDone) return;
    if (window.innerWidth < MIN_DESKTOP_WIDTH) return;
    const timer = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  // Navigate to the step's route if needed
  useEffect(() => {
    if (!open) return;
    if (!step.route || pathname === step.route) return;
    router.push(step.route);
  }, [open, pathname, router, step.route]);

  const refreshTarget = useCallback(() => {
    if (!open) return;
    if (!step.target) {
      setTargetRect(null);
      return;
    }
    const element = document.querySelector(step.target) as HTMLElement | null;
    if (!element) {
      setTargetRect(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      setTargetRect(null);
      return;
    }
    setTargetRect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
  }, [open, step.target]);

  useEffect(() => {
    if (!open) return;
    const rafId = window.requestAnimationFrame(() => refreshTarget());
    const interval = window.setInterval(refreshTarget, 220);
    window.addEventListener("resize", refreshTarget);
    window.addEventListener("scroll", refreshTarget, true);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearInterval(interval);
      window.removeEventListener("resize", refreshTarget);
      window.removeEventListener("scroll", refreshTarget, true);
    };
  }, [open, refreshTarget, pathname, stepIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        markDoneAndClose();
        return;
      }
      if (event.key === "ArrowLeft" && stepIndex > 0) {
        setStepIndex((current) => Math.max(0, current - 1));
      }
      if (event.key === "ArrowRight") {
        if (isLast) {
          markDoneAndClose();
        } else {
          setStepIndex((current) => Math.min(TOUR_STEPS.length - 1, current + 1));
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLast, markDoneAndClose, open, stepIndex]);

  const focusRect = useMemo(() => {
    if (!targetRect || viewport.width === 0 || viewport.height === 0) return null;
    const left = clamp(targetRect.left - TOUR_PAD, 8, viewport.width - 8);
    const top = clamp(targetRect.top - TOUR_PAD, 8, viewport.height - 8);
    const right = clamp(targetRect.left + targetRect.width + TOUR_PAD, 8, viewport.width - 8);
    const bottom = clamp(targetRect.top + targetRect.height + TOUR_PAD, 8, viewport.height - 8);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    if (width < 1 || height < 1) return null;
    return { left, top, width, height };
  }, [targetRect, viewport.height, viewport.width]);

  const panelStyle = useMemo(
    () => getPanelPosition(focusRect, step.placement || "bottom", viewport),
    [focusRect, step.placement, viewport]
  );

  if (!open) return null;

  return (
    <>
      {/* Backdrop overlay */}
      <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-[1px]" />

      {/* Highlighted element focus ring */}
      {focusRect && (
        <div
          className="pointer-events-none fixed z-[121] rounded-xl border-2 border-mc-accent/95 shadow-[0_0_0_2px_rgba(230,195,100,0.35),0_0_30px_rgba(230,195,100,0.28)]"
          style={{
            left: `${focusRect.left}px`,
            top: `${focusRect.top}px`,
            width: `${focusRect.width}px`,
            height: `${focusRect.height}px`,
          }}
        />
      )}

      {/* Tour card */}
      <div
        className="fixed z-[122] rounded-2xl border border-mc-border bg-mc-bg-secondary p-5 text-mc-text shadow-2xl"
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-label="Mission Control tour"
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-mc-accent/15 text-mc-accent">
            {isLast ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-mc-text-secondary">
              Tour step {stepIndex + 1} of {TOUR_STEPS.length}
            </p>
            <h3 className="text-base font-semibold leading-tight">{step.title}</h3>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-mc-text-secondary">
          {step.description}
        </p>

        {/* Progress dots */}
        <div className="mt-4 flex items-center gap-1.5">
          {TOUR_STEPS.map((tourStep, index) => (
            <span
              key={tourStep.id}
              className={
                index <= stepIndex
                  ? "h-1.5 w-6 rounded-full bg-mc-accent"
                  : "h-1.5 w-6 rounded-full bg-mc-border"
              }
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={markDoneAndClose}
            className="rounded-lg px-3 py-2 text-xs font-medium text-mc-text-secondary transition-colors hover:bg-mc-bg-tertiary hover:text-mc-text"
          >
            Skip tour
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              disabled={stepIndex === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-mc-border px-3 py-2 text-xs font-medium text-mc-text-secondary transition-colors hover:bg-mc-bg-tertiary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>

            <button
              type="button"
              onClick={() => {
                if (isLast) {
                  markDoneAndClose();
                  return;
                }
                setStepIndex((current) => Math.min(TOUR_STEPS.length - 1, current + 1));
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-mc-accent px-3.5 py-2 text-xs font-semibold text-mc-bg transition-colors hover:bg-mc-accent/90"
            >
              {isLast ? "Finish" : "Next"}
              {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}