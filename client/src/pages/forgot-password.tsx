import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";
import { TableSaltLogo } from "@/components/brand/table-salt-logo";
import { apiRequest } from "@/lib/queryClient";
import { PageTitle } from "@/lib/accessibility";

export default function ForgotPasswordPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email });
      setSubmitted(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ variant: "destructive", title: "Error", description: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <PageTitle title="Forgot Password" />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg">Skip to main content</a>
      <div className="w-full max-w-md" id="main-content">
        <div className="flex items-center justify-center mb-8">
          <TableSaltLogo variant="full" iconSize={32} />
        </div>

        {submitted ? (
          <div className="text-center space-y-4" data-testid="forgot-password-success">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold">Check your email</h2>
            <p className="text-muted-foreground text-sm">
              If an account is registered with <strong>{email}</strong>, you will receive a password reset link shortly. The link expires in 1 hour.
            </p>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => navigate("/login")}
              data-testid="button-back-to-login"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to login
            </Button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-1 text-center" data-testid="text-forgot-password-title">Forgot your password?</h2>
            <p className="text-muted-foreground text-sm text-center mb-8">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="email"
                    data-testid="input-reset-email"
                    type="email"
                    placeholder="Enter your email"
                    className="pl-10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 gap-2"
                disabled={loading}
                data-testid="button-send-reset"
              >
                {loading ? (
                  <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <>Send reset link</>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto"
                onClick={() => navigate("/login")}
                data-testid="link-back-to-login"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to login
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
