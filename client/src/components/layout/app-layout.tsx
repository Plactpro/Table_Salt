import { ReactNode, useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import Sidebar from "./sidebar";
import Header from "./header";
import { Headset, Lock, Pencil, X, ShieldAlert } from "lucide-react";
import ContactSupportModal from "@/components/widgets/contact-support-modal";
import { useImpersonation } from "@/lib/impersonation-context";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import TrialBanner from "@/components/billing/trial-banner";
import { RealtimeStatusBanner } from "@/components/RealtimeStatusBanner";
import UnlockEditDialog from "@/components/admin/unlock-edit-dialog";
import { useToast } from "@/hooks/use-toast";

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

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const [showContactSupport, setShowContactSupport] = useState(false);

  const { data: contactConfig } = useQuery<{ salesEnabled: boolean; supportEnabled: boolean }>({
    queryKey: ["/api/contact-config"],
    staleTime: 60000,
  });

  const isPosPage = location === "/pos";
  const supportEnabled = contactConfig?.supportEnabled !== false;

  return (
    <div className="flex flex-col min-h-screen" data-testid="app-layout">
      <RealtimeStatusBanner />
      <TrialBanner />
      <ImpersonationBanner />

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
