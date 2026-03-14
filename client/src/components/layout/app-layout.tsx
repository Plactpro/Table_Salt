import { ReactNode, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "./sidebar";
import Header from "./header";
import { MessageSquare, Headset } from "lucide-react";
import ContactSalesModal from "@/components/widgets/contact-sales-modal";
import ContactSupportModal from "@/components/widgets/contact-support-modal";

interface AppLayoutProps {
  children: ReactNode;
}

const SALES_PAGES = ["/billing"];

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const [showContactSales, setShowContactSales] = useState(false);
  const [showContactSupport, setShowContactSupport] = useState(false);

  const { data: contactConfig } = useQuery<{ salesEnabled: boolean; supportEnabled: boolean }>({
    queryKey: ["/api/contact-config"],
    staleTime: 60000,
  });

  const isSalesPage = SALES_PAGES.includes(location);
  const salesEnabled = contactConfig?.salesEnabled !== false;
  const supportEnabled = contactConfig?.supportEnabled !== false;

  return (
    <div className="flex min-h-screen" data-testid="app-layout">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <Header
          onOpenSupport={supportEnabled ? () => setShowContactSupport(true) : undefined}
        />
        <AnimatePresence mode="wait">
          <motion.main
            key={location}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="flex-1 p-6 overflow-auto"
            data-testid="main-content"
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isSalesPage && salesEnabled && (
          <motion.button
            key="sales-fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowContactSales(true)}
            className="fixed bottom-[30px] right-[30px] z-[1000] h-[52px] px-5 rounded-full text-white font-bold shadow-lg hover:shadow-xl flex items-center gap-2 transition-shadow"
            style={{
              background: "linear-gradient(135deg, #FFD700, #FFA500)",
            }}
            data-testid="button-contact-sales-float"
          >
            <div className="absolute inset-0 rounded-full animate-pulse opacity-30" style={{ background: "linear-gradient(135deg, #FFD700, #FFA500)" }} />
            <MessageSquare className="h-5 w-5 relative z-10" />
            <span className="relative z-10 text-sm">Contact Sales</span>
          </motion.button>
        )}
      </AnimatePresence>

      {supportEnabled && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowContactSupport(true)}
          className={`fixed z-[999] w-12 h-12 rounded-full bg-cyan-600 hover:bg-cyan-700 text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-colors sm:hidden ${
            isSalesPage && salesEnabled ? "bottom-[90px] right-[30px]" : "bottom-[30px] right-[30px]"
          }`}
          title="Contact Support"
          data-testid="button-contact-support-float"
        >
          <Headset className="h-5 w-5" />
        </motion.button>
      )}

      <ContactSalesModal open={showContactSales} onOpenChange={setShowContactSales} />
      <ContactSupportModal open={showContactSupport} onOpenChange={setShowContactSupport} />
    </div>
  );
}
