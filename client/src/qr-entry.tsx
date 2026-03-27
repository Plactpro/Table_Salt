import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Switch, Route } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GuestPage from "./pages/guest";
import TableQrPage from "./pages/table-qr";
import "./qr.css";

const qrQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

function QrApp() {
  return (
    <QueryClientProvider client={qrQueryClient}>
      <Switch>
        <Route path="/guest/o/:outletId/t/:tableToken" component={GuestPage} />
        <Route path="/table" component={TableQrPage} />
        <Route>
          <div
            style={{
              minHeight: "100vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px",
              background: "#f9fafb",
            }}
            data-testid="qr-not-found"
          >
            <div style={{ textAlign: "center", maxWidth: 320 }}>
              <p style={{ fontSize: 18, fontWeight: 600, color: "#111827", marginBottom: 8 }}>
                Invalid QR code
              </p>
              <p style={{ fontSize: 14, color: "#6b7280" }}>
                Please scan the QR code at your table again or ask your server for help.
              </p>
            </div>
          </div>
        </Route>
      </Switch>
    </QueryClientProvider>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QrApp />
    </StrictMode>
  );
}
