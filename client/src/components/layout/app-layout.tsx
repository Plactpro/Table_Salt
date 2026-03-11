import { ReactNode } from "react";
import Sidebar from "./sidebar";
import Header from "./header";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen" data-testid="app-layout">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-6 overflow-auto" data-testid="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
