import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { X, Zap, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

function getDaysRemaining(trialEndsAt: string | null | undefined): number {
  if (!trialEndsAt) return 0;
  const end = new Date(trialEndsAt);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function TrialBanner() {
  const { tenant, user } = useAuth();
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem("trial_banner_dismissed") === "true";
    } catch {
      return false;
    }
  });

  if (!tenant || !user) return null;

  const role = user.role as string;
  if (role !== "owner" && role !== "manager") return null;

  if (tenant.subscriptionStatus !== "trialing") return null;

  if (dismissed) return null;

  const days = getDaysRemaining(tenant.trialEndsAt);

  let bannerClass = "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-200";
  let accentClass = "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
  if (days <= 3) {
    bannerClass = "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-200";
    accentClass = "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
  } else if (days <= 7) {
    bannerClass = "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200";
    accentClass = "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
  }

  const handleDismiss = () => {
    try {
      sessionStorage.setItem("trial_banner_dismissed", "true");
    } catch {}
    setDismissed(true);
  };

  return (
    <div
      data-testid="banner-trial"
      className={`border rounded-lg px-4 py-3 flex items-center gap-3 mb-4 ${bannerClass}`}
    >
      <div className={`p-1.5 rounded-md shrink-0 ${accentClass}`}>
        <Clock className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-semibold">You're on a free trial — </span>
        <span data-testid="text-trial-days-remaining">
          {days} {days === 1 ? "day" : "days"} remaining
        </span>
        <span className="hidden sm:inline text-sm ml-1 opacity-80">
          — Upgrade to keep all features after your trial ends.
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-current"
          onClick={() => navigate("/settings?tab=subscription")}
          data-testid="button-upgrade-now"
        >
          <Zap className="h-3 w-3 mr-1" />
          Upgrade Now
        </Button>
        <button
          type="button"
          onClick={handleDismiss}
          data-testid="button-dismiss-trial"
          className="p-1 rounded hover:bg-black/10 transition-colors"
          aria-label="Dismiss trial banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
