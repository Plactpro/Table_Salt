import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("[GlobalErrorBoundary] Uncaught error:", error, info);
    }

    if (typeof window !== "undefined" && import.meta.env.PROD) {
      try {
        fetch("/api/errors/client", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: error.message,
            stack: error.stack,
            pathname: window.location.pathname,
            userAgent: navigator.userAgent,
          }),
        }).catch(() => {});
      } catch (_) {}
    }
  }

  render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV;
      return (
        <div
          className="min-h-screen flex items-center justify-center bg-background p-4"
          data-testid="global-error-boundary"
        >
          <Card className="max-w-lg w-full">
            <CardContent className="py-12 text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8 text-destructive" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold font-heading">Table Salt</h1>
                <h2 className="text-lg font-semibold text-muted-foreground">Something went wrong</h2>
                {isDev && this.state.error && (
                  <p className="text-xs text-destructive font-mono bg-destructive/5 p-3 rounded-md text-left break-all">
                    {this.state.error.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  variant="default"
                  onClick={() => window.location.reload()}
                  data-testid="button-refresh-page"
                  className="gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh Page
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { window.location.href = "/"; }}
                  data-testid="link-go-dashboard"
                  className="gap-2"
                >
                  <Home className="w-4 h-4" />
                  Go to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
