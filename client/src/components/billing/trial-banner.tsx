import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, X, Zap, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";

function getDismissKey() {
  const today = new Date().toISOString().slice(0, 10);
  return `trial_banner_dismissed_${today}`;
}

export default function TrialBanner() {
  const { tenant } = useAuth();
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(getDismissKey()) === "1";
    } catch {
      return false;
    }
  });
  // PR-009: Also detect grace via apiRequest's X-Subscription-Warning header event.
  const [graceFromHeader, setGraceFromHeader] = useState(false);
  useEffect(() => {
    const handler = () => setGraceFromHeader(true);
    window.addEventListener("subscription-grace-warning", handler);
    return () => window.removeEventListener("subscription-grace-warning", handler);
  }, []);

  const { data: billingStatus } = useQuery<{ graceStatus?: string }>({
    queryKey: ["/api/billing/status"],
    staleTime: 5 * 60 * 1000,
    enabled: !!tenant,
  });

  if (!tenant) return null;

  const status = tenant.subscriptionStatus ?? "trialing";
  const isPastDue = status === "past_due";
  const isTrialing = status === "trialing";

  // PR-009: Show amber grace period banner when subscription expired within last 24 hours.
  // Triggered by billing status poll OR by X-Subscription-Warning header from any API call.
  // This banner is intentionally non-dismissible — it must remain visible until renewal.
  const isExpiredGrace = billingStatus?.graceStatus === "expired_grace" || graceFromHeader;
  if (isExpiredGrace) {
    return (
      <div
        className="w-full bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between z-40 shrink-0"
        data-testid="banner-subscription-grace"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Subscription expired — please renew. Service continues for up to 24 hours.</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-amber-700 text-amber-950 bg-amber-300 hover:bg-amber-400 h-7 text-xs font-semibold"
          onClick={() => navigate("/settings?tab=subscription")}
          data-testid="button-grace-renew"
        >
          <CreditCard className="h-3 w-3 mr-1" />
          Renew Now
        </Button>
      </div>
    );
  }

  if (dismissed) return null;
  if (!isTrialing && !isPastDue) return null;

  const handleDismiss = () => {
    try { localStorage.setItem(getDismissKey(), "1"); } catch {}
    setDismissed(true);
  };

  const handleUpgrade = () => {
    navigate("/settings?tab=subscription");
  };

  if (isPastDue) {
    return (
      <div
        className="w-full bg-red-600 text-white px-4 py-2 flex items-center justify-between z-40 shrink-0"
        data-testid="past-due-banner"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Payment failed — your account may lose access soon.</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-red-300 text-white bg-red-700 hover:bg-red-800 h-7 text-xs font-semibold"
            onClick={handleUpgrade}
            data-testid="button-past-due-upgrade"
          >
            <CreditCard className="h-3 w-3 mr-1" />
            Update Payment
          </Button>
          <button
            onClick={handleDismiss}
            className="ml-1 opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
            data-testid="button-dismiss-past-due-banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const trialEndsAt = tenant.trialEndsAt ? new Date(tenant.trialEndsAt) : null;
  const msLeft = trialEndsAt ? trialEndsAt.getTime() - Date.now() : 0;
  const daysLeft = trialEndsAt ? Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000))) : 0;
  const totalDays = 30;
  const consumed = Math.min(100, Math.round(((totalDays - daysLeft) / totalDays) * 100));

  const urgency = daysLeft <= 5 ? "bg-orange-500" : daysLeft <= 10 ? "bg-yellow-500" : "bg-teal-600";
  const textColor = daysLeft <= 5 ? "text-orange-950" : daysLeft <= 10 ? "text-yellow-950" : "text-teal-50";
  const barColor = daysLeft <= 5 ? "bg-orange-300" : daysLeft <= 10 ? "bg-yellow-300" : "bg-teal-400";
  const barTrack = daysLeft <= 5 ? "bg-orange-700" : daysLeft <= 10 ? "bg-yellow-700" : "bg-teal-800";

  return (
    <div
      className={`w-full ${urgency} ${textColor} px-4 py-1.5 flex items-center justify-between z-40 shrink-0`}
      data-testid="trial-banner"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Zap className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium shrink-0">
          {daysLeft > 0
            ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left in your free trial`
            : "Your free trial has ended"}
        </span>
        <div className={`hidden sm:flex items-center gap-1.5 ${barTrack} rounded-full h-1.5 w-28 shrink-0`}>
          <div
            className={`${barColor} rounded-full h-1.5 transition-all`}
            style={{ width: `${consumed}%` }}
            data-testid="trial-progress-bar"
          />
        </div>
        <span className="hidden sm:inline text-xs opacity-75 shrink-0">Standard features during trial</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className={`border-current/40 bg-white/20 hover:bg-white/30 ${textColor} h-7 text-xs font-semibold`}
          onClick={handleUpgrade}
          data-testid="button-trial-upgrade"
        >
          Upgrade Now
        </Button>
        <button
          onClick={handleDismiss}
          className="ml-1 opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Dismiss trial banner"
          data-testid="button-dismiss-trial-banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
