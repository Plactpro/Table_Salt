import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import React from "react";

interface CharCounterProps {
  current: number;
  max: number;
}

function CharCounter({ current, max }: CharCounterProps) {
  const pct = max > 0 ? current / max : 0;
  const colorClass = pct >= 1 ? "text-red-500" : pct >= 0.9 ? "text-amber-500" : "text-muted-foreground";
  return (
    <span className={cn("text-xs tabular-nums", colorClass)} data-testid="char-counter">
      {current} / {max}
    </span>
  );
}

type TextareaProps = React.ComponentPropsWithoutRef<typeof Textarea>;

export function CharCountTextarea({ maxLength, value, onChange, className, ...props }: TextareaProps & { maxLength: number }) {
  const current = typeof value === "string" ? value.length : 0;
  return (
    <div className="space-y-1">
      <Textarea
        maxLength={maxLength}
        value={value}
        onChange={onChange}
        className={className}
        {...props}
      />
      <div className="flex justify-end">
        <CharCounter current={current} max={maxLength} />
      </div>
    </div>
  );
}

type InputProps = React.ComponentPropsWithoutRef<typeof Input>;

export function CharCountInput({ maxLength, value, onChange, className, ...props }: InputProps & { maxLength: number }) {
  const current = typeof value === "string" ? value.length : 0;
  return (
    <div className="space-y-1">
      <Input
        maxLength={maxLength}
        value={value}
        onChange={onChange}
        className={className}
        {...props}
      />
      <div className="flex justify-end">
        <CharCounter current={current} max={maxLength} />
      </div>
    </div>
  );
}
