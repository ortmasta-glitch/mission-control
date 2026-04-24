"use client";

import { cn } from "@/lib/utils";

interface TypingDotsProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "h-1 w-1 gap-0.5",
  md: "h-1.5 w-1.5 gap-1",
  lg: "h-2 w-2 gap-1.5",
};

export function TypingDots({ size = "md", className }: TypingDotsProps) {
  return (
    <span
      className={cn("inline-flex items-center", sizeMap[size], className)}
      aria-label="Thinking"
    >
      <span className="animate-bounce rounded-full bg-current [animation-delay:0ms]" />
      <span className="animate-bounce rounded-full bg-current [animation-delay:150ms]" />
      <span className="animate-bounce rounded-full bg-current [animation-delay:300ms]" />
    </span>
  );
}