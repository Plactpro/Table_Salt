import { ReactNode, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "./sidebar";
import Header from "./header";
import { MessageSquare } from "lucide-react";
import ContactSalesModal from "@/components/widgets/contact-sales-modal";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const [showContactSales, setShowContactSales] = useState(false);

  return (
    <div className="flex min-h-screen" data-testid="app-layout">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <Header />
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

      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setShowContactSales(true)}
        className="fixed bottom-6 left-6 z-[999] w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-700 text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-colors sm:hidden"
        data-testid="button-contact-sales-float"
      >
        <MessageSquare className="h-6 w-6" />
      </motion.button>

      <ContactSalesModal open={showContactSales} onOpenChange={setShowContactSales} />
    </div>
  );
}
