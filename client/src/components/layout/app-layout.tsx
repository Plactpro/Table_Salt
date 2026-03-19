import { ReactNode, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import Sidebar from "./sidebar";
import Header from "./header";
import { Headset, AlertTriangle, ArrowLeft } from "lucide-react";
import ContactSupportModal from "@/components/widgets/contact-support-modal";
import { useImpersonation } from "@/lib/impersonation-context";
import { Button } from "@/components/ui/button";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const [showContactSupport, setShowContactSupport] = useState(false);
  const { isImpersonating, tenantName, originalAdmin, endImpersonation } = useImpersonation();

  const { data: contactConfig } = useQuery<{ salesEnabled: boolean; supportEnabled: boolean }>({
    queryKey: ["/api/contact-config"],
    staleTime: 60000,
  });

  const isPosPage = location === "/pos";
  const supportEnabled = contactConfig?.supportEnabled !== false;

  return (
    <div className="flex flex-col min-h-screen" data-testid="app-layout">
      {isImpersonating && (
        <div
          className="w-full bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between z-50 shrink-0"
          data-testid="impersonation-banner-app"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Impersonating: {tenantName ?? "Tenant"}
              {originalAdmin ? ` (as ${originalAdmin.userName})` : ""}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-700 text-amber-900 bg-amber-100 hover:bg-amber-200 h-7 text-xs font-semibold"
            onClick={endImpersonation}
            data-testid="button-end-impersonation-app"
          >
            <ArrowLeft className="h-3 w-3 mr-1" />
            Return to Admin
          </Button>
        </div>
      )}

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
