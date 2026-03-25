import { ReactNode, useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import Sidebar from "./sidebar";
import Header from "./header";
import { Headset, Lock, Pencil, X, ShieldAlert, FileText, ExternalLink, AlertTriangle } from "lucide-react";
import ContactSupportModal from "@/components/widgets/contact-support-modal";
import { useImpersonation } from "@/lib/impersonation-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ToastAction } from "@/components/ui/toast";
import TrialBanner from "@/components/billing/trial-banner";
import { RealtimeStatusBanner } from "@/components/RealtimeStatusBanner";
import UnlockEditDialog from "@/components/admin/unlock-edit-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface AppLayoutProps {
  children: ReactNode;
}

function ImpersonationBanner() {
  const {
    isImpersonating,
    tenantName,
    originalAdmin,
    accessMode,
    reason,
    ticketId,
    startedAt,
    timeoutMinutes,
    endImpersonation,
    returnToReadOnly,
  } = useImpersonation();
  const { toast } = useToast();
  const [timeLeft, setTimeLeft] = useState("");
  const [showUnlock, setShowUnlock] = useState(false);

  // Countdown timer
  useEffect(() => {
    if (!startedAt || !timeoutMinutes) return;
    const expiresAt = startedAt + timeoutMinutes * 60 * 1000;
    const tick = () => {
      const diff = expiresAt - Date.now();
      if (diff <= 0) {
        setTimeLeft("00:00");
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, timeoutMinutes]);

  // Listen for read-only blocked events
  const unlockRef = useRef<(() => void) | null>(null);
  unlockRef.current = () => setShowUnlock(true);
  useEffect(() => {
    const handler = () => {
      toast({
        title: "Read-Only Session",
        description: "You're in a read-only support session. Unlock edit mode to make changes.",
        action: (
          <ToastAction altText="Unlock Edit Mode" onClick={() => unlockRef.current?.()}>
            Unlock Edit
          </ToastAction>
        ),
      });
    };
    window.addEventListener("read-only-session-blocked", handler);
    return () => window.removeEventListener("read-only-session-blocked", handler);
  }, [toast]);

  if (!isImpersonating) return null;

  const isEdit = accessMode === "EDIT";
  const bannerBg = isEdit ? "bg-orange-600" : "bg-amber-500";
  const bannerText = isEdit ? "text-white" : "text-amber-950";

  return (
    <>
      <div
        className={`w-full ${bannerBg} ${bannerText} px-4 py-2 z-50 shrink-0`}
        data-testid="impersonation-banner-app"
      >
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>
                {isEdit ? "SUPPORT SESSION — EDIT ENABLED" : "SUPPORT SESSION"}
              </span>
              {tenantName && (
                <>
                  <span className="opacity-60">·</span>
                  <span>Tenant: <strong>{tenantName}</strong></span>
                </>
              )}
              {originalAdmin && (
                <>
                  <span className="opacity-60">·</span>
                  <span>Admin: {originalAdmin.userName}</span>
                </>
              )}
              {!isEdit && (
                <>
                  <span className="opacity-60">·</span>
                  <span className="flex items-center gap-1">
                    <Lock className="h-3 w-3" /> READ ONLY
                  </span>
                </>
              )}
              {isEdit && (
                <>
                  <span className="opacity-60">·</span>
                  <span>Every change is logged</span>
                </>
              )}
              {timeLeft && !isEdit && (
                <>
                  <span className="opacity-60">·</span>
                  <span>⏱ {timeLeft} left</span>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {reason && (
                <span className="opacity-75 hidden sm:inline">Reason: {reason}</span>
              )}
              {ticketId && (
                <span className="opacity-75 hidden sm:inline">· Ticket: {ticketId}</span>
              )}
              {!isEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-current text-current bg-transparent hover:bg-black/10 h-7 text-xs font-semibold"
                  onClick={() => setShowUnlock(true)}
                  data-testid="button-unlock-edit"
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Unlock Edit
                </Button>
              )}
              {isEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-current text-current bg-transparent hover:bg-black/10 h-7 text-xs font-semibold"
                  onClick={returnToReadOnly}
                  data-testid="button-return-readonly"
                >
                  <Lock className="h-3 w-3 mr-1" />
                  Return to Read Only
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="border-current text-current bg-transparent hover:bg-black/10 h-7 text-xs font-semibold"
                onClick={endImpersonation}
                data-testid="button-end-impersonation-app"
              >
                <X className="h-3 w-3 mr-1" />
                End Session
              </Button>
            </div>
          </div>
        </div>
      </div>
      <UnlockEditDialog open={showUnlock} onOpenChange={setShowUnlock} />
    </>
  );
}

function RestrictionBanner() {
  const { user } = useAuth();
  if (!user?.processingRestricted) return null;

  return (
    <div
      className="w-full bg-amber-100 border-b border-amber-300 text-amber-900 px-4 py-2 z-50 shrink-0"
      data-testid="restriction-banner"
    >
      <div className="max-w-7xl mx-auto flex items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
        <span className="font-semibold">DATA PROCESSING RESTRICTION ACTIVE</span>
        <span className="opacity-70">·</span>
        <span>
          Your account has a data processing restriction in place
          {user.restrictionRequestedAt && (
            <> since {new Date(user.restrictionRequestedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>
          )}
          . Some actions are paused.
        </span>
        <span className="opacity-70">·</span>
        <span>Contact your manager or administrator to lift this.</span>
      </div>
    </div>
  );
}

interface ConsentStatus {
  tos: { version: string; acceptedAt: string } | null;
  privacy_policy: { version: string; acceptedAt: string } | null;
  platform: { tosVersion: string; privacyVersion: string; tosUrl: string; privacyUrl: string };
}

function ConsentUpdateModal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: consentStatus } = useQuery<ConsentStatus>({
    queryKey: ["/api/consent/status"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/consent/status");
      if (!r.ok) throw new Error("Failed to fetch consent status");
      return r.json();
    },
    enabled: !!user && user.role !== "super_admin",
    staleTime: 60000,
  });

  const needsUpdate = consentStatus && (
    (consentStatus.tos === null || consentStatus.tos.version !== consentStatus.platform.tosVersion) ||
    (consentStatus.privacy_policy === null || consentStatus.privacy_policy.version !== consentStatus.platform.privacyVersion)
  );

  const handleAccept = async () => {
    if (!consentStatus || !accepted) return;
    setSubmitting(true);
    try {
      const docs = [];
      if (!consentStatus.tos || consentStatus.tos.version !== consentStatus.platform.tosVersion) {
        docs.push({ documentType: "tos", documentVersion: consentStatus.platform.tosVersion });
      }
      if (!consentStatus.privacy_policy || consentStatus.privacy_policy.version !== consentStatus.platform.privacyVersion) {
        docs.push({ documentType: "privacy_policy", documentVersion: consentStatus.platform.privacyVersion });
      }
      for (const doc of docs) {
        await apiRequest("POST", "/api/consent/accept", doc);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/consent/status"] });
    } catch (e) {
      console.error("Consent accept failed:", e);
    } finally {
      setSubmitting(false);
    }
  };

  if (!needsUpdate) return null;

  const tosVersion = consentStatus?.platform.tosVersion;
  const tosUrl = consentStatus?.platform.tosUrl || "/legal/terms";
  const privacyUrl = consentStatus?.platform.privacyUrl || "/legal/privacy";

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        data-testid="consent-update-modal"
      >
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-5 w-5 text-primary" />
            <DialogTitle>Updated Terms of Service</DialogTitle>
          </div>
          <DialogDescription>
            We've updated our Terms of Service{tosVersion ? ` (v${tosVersion})` : ""} and Privacy Policy. Please review and accept to continue using Table Salt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-3">
            <a
              href={tosUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm text-primary hover:underline border rounded-md px-3 py-2"
              data-testid="link-view-terms"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View Terms of Service
            </a>
            <a
              href={privacyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm text-primary hover:underline border rounded-md px-3 py-2"
              data-testid="link-view-privacy"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View Privacy Policy
            </a>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
            <Checkbox
              id="consent-accept"
              data-testid="checkbox-consent-accept"
              checked={accepted}
              onCheckedChange={(c) => setAccepted(c === true)}
              className="mt-0.5"
            />
            <Label htmlFor="consent-accept" className="text-sm leading-relaxed cursor-pointer">
              I have read and accept the updated terms
            </Label>
          </div>
          <Button
            className="w-full"
            disabled={!accepted || submitting}
            onClick={handleAccept}
            data-testid="button-accept-consent"
          >
            {submitting ? "Saving..." : "Accept & Continue"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const [showContactSupport, setShowContactSupport] = useState(false);

  const { data: contactConfig } = useQuery<{ salesEnabled: boolean; supportEnabled: boolean }>({
    queryKey: ["/api/contact-config"],
    staleTime: 60000,
  });

  const isPosPage = location === "/pos";
  const supportEnabled = contactConfig?.supportEnabled !== false;

  const { data: platformSettings } = useQuery<{ tosUrl?: string; privacyUrl?: string }>({
    queryKey: ["/api/consent/status/platform"],
    queryFn: async () => {
      try {
        const r = await apiRequest("GET", "/api/consent/status");
        if (!r.ok) return {};
        const d = await r.json();
        return d.platform || {};
      } catch { return {}; }
    },
    staleTime: 300000,
    enabled: true,
  });

  return (
    <div className="flex flex-col min-h-screen" data-testid="app-layout">
      <RealtimeStatusBanner />
      <TrialBanner />
      <ImpersonationBanner />
      <RestrictionBanner />
      <ConsentUpdateModal />

      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-screen">
          <Header
            onOpenSupport={supportEnabled ? () => setShowContactSupport(true) : undefined}
          />
          <motion.main
            key={location}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{ willChange: "opacity" }}
            className={`flex-1 overflow-auto ${isPosPage ? "" : "p-6"}`}
            data-testid="main-content"
            id="main-content"
          >
            {children}
          </motion.main>
          <footer className="border-t bg-muted/30 px-6 py-3 text-xs text-muted-foreground flex items-center gap-2 shrink-0" data-testid="app-footer">
            <span>© {new Date().getFullYear()} Table Salt</span>
            <span className="opacity-40">·</span>
            <a
              href={platformSettings?.privacyUrl || "/legal/privacy"}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
              data-testid="link-footer-privacy"
            >Privacy Policy</a>
            <span className="opacity-40">·</span>
            <a
              href={platformSettings?.tosUrl || "/legal/terms"}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
              data-testid="link-footer-terms"
            >Terms of Service</a>
          </footer>
        </div>
      </div>

      {supportEnabled && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowContactSupport(true)}
          className="fixed z-[999] w-12 h-12 rounded-full bg-cyan-600 hover:bg-cyan-700 text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-colors sm:hidden bottom-[30px] right-[30px]"
          title="Contact Support"
          data-testid="button-contact-support-float"
        >
          <Headset className="h-5 w-5" />
        </motion.button>
      )}

      <ContactSupportModal open={showContactSupport} onOpenChange={setShowContactSupport} />
    </div>
  );
}
