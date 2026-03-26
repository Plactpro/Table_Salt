import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Cookie } from "lucide-react";

const STORAGE_KEY = "cookie_consent_v1";

const PUBLIC_ROUTES = ["/", "/login", "/register", "/forgot-password", "/reset-password"];

function isPublicRoute(path: string): boolean {
  return PUBLIC_ROUTES.some(r => path === r || path.startsWith(r + "?"));
}

function getSessionId(): string {
  let sid = sessionStorage.getItem("cookie_session_id");
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem("cookie_session_id", sid);
  }
  return sid;
}

async function recordConsent(analytics: boolean, marketing: boolean) {
  try {
    await apiRequest("POST", "/api/consent/cookies", {
      analytics,
      marketing,
      sessionId: getSessionId(),
    });
  } catch (_) {}
}

export default function CookieConsentBanner() {
  const [location] = useLocation();
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (!isPublicRoute(location)) return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setVisible(true);
    }
  }, [location]);

  if (!visible || !isPublicRoute(location)) return null;

  const accept = (analyticsVal: boolean, marketingVal: boolean) => {
    const prefs = { necessary: true, analytics: analyticsVal, marketing: marketingVal };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prefs, savedAt: new Date().toISOString() }));
    recordConsent(analyticsVal, marketingVal);
    setVisible(false);
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background shadow-lg"
      data-testid="cookie-consent-banner"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex items-start gap-3">
          <Cookie className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold mb-0.5">We use cookies</p>
            <p className="text-sm text-muted-foreground">
              Table Salt uses essential cookies required for the app to function.
              We do not currently use analytics or marketing cookies.
            </p>

            {expanded && (
              <div className="mt-3 space-y-2 p-3 bg-slate-50 rounded-lg text-sm">
                <div className="flex items-start gap-2">
                  <Checkbox checked disabled data-testid="checkbox-necessary" />
                  <div>
                    <p className="font-medium">Necessary (always on)</p>
                    <p className="text-muted-foreground text-xs">Session management, security, authentication</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={analytics}
                    onCheckedChange={v => setAnalytics(v === true)}
                    data-testid="checkbox-analytics"
                  />
                  <div>
                    <p className="font-medium">Analytics (optional) — not currently used</p>
                    <p className="text-muted-foreground text-xs">Would allow us to improve the product</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={marketing}
                    onCheckedChange={v => setMarketing(v === true)}
                    data-testid="checkbox-marketing"
                  />
                  <div>
                    <p className="font-medium">Marketing (optional) — not currently used</p>
                    <p className="text-muted-foreground text-xs">Promotional communications</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            {!expanded ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpanded(true)}
                  data-testid="button-cookie-settings"
                >
                  Cookie Settings
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => accept(false, false)}
                  data-testid="button-necessary-only"
                >
                  Necessary Only
                </Button>
                <Button
                  size="sm"
                  onClick={() => accept(true, true)}
                  data-testid="button-accept-all"
                >
                  Accept All
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpanded(false)}
                  data-testid="button-cookie-collapse"
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={() => accept(analytics, marketing)}
                  data-testid="button-save-preferences"
                >
                  Save Preferences
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
