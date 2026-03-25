import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff, CheckCircle, ArrowLeft } from "lucide-react";
import { TableSaltLogo } from "@/components/brand/table-salt-logo";
import { apiRequest } from "@/lib/queryClient";
import { PageTitle } from "@/lib/accessibility";

function getTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("token");
}

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const token = getTokenFromUrl();

  const passwordChecks = [
    { label: "At least 8 characters", met: newPassword.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(newPassword) },
    { label: "Lowercase letter", met: /[a-z]/.test(newPassword) },
    { label: "Number", met: /[0-9]/.test(newPassword) },
    { label: "Special character", met: /[^A-Za-z0-9]/.test(newPassword) },
  ];

  const allChecksMet = passwordChecks.every((c) => c.met);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast({ variant: "destructive", title: "Invalid link", description: "This password reset link is invalid or missing a token." });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ variant: "destructive", title: "Passwords don't match" });
      return;
    }
    if (!allChecksMet) {
      toast({ variant: "destructive", title: "Password too weak", description: "Please meet all password requirements." });
      return;
    }
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", { token, newPassword });
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ variant: "destructive", title: "Reset failed", description: message });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md text-center space-y-4" data-testid="reset-password-success">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold">Password reset!</h2>
          <p className="text-muted-foreground text-sm">
            Your password has been successfully reset. You can now sign in with your new password.
          </p>
          <Button className="w-full" onClick={() => navigate("/login")} data-testid="button-go-to-login">
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md text-center space-y-4" data-testid="reset-password-invalid">
          <h2 className="text-2xl font-bold">Invalid reset link</h2>
          <p className="text-muted-foreground text-sm">This password reset link is invalid or has expired. Please request a new one.</p>
          <Button variant="outline" onClick={() => navigate("/forgot-password")} data-testid="button-request-new-link">
            Request new link
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <PageTitle title="Reset Password" />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg">Skip to main content</a>
      <div className="w-full max-w-md" id="main-content">
        <div className="flex items-center justify-center mb-8">
          <TableSaltLogo variant="full" iconSize={32} />
        </div>

        <h2 className="text-2xl font-bold mb-1 text-center" data-testid="text-reset-password-title">Set new password</h2>
        <p className="text-muted-foreground text-sm text-center mb-8">
          Choose a strong password for your account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="new-password"
                data-testid="input-new-password"
                type={showNew ? "text" : "password"}
                placeholder="Enter new password"
                className="pl-10 pr-10"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowNew(!showNew)}
                aria-label={showNew ? "Hide new password" : "Show new password"}
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </div>

          {newPassword && (
            <div className="space-y-1 text-xs" data-testid="password-requirements">
              {passwordChecks.map((c, i) => (
                <div key={i} className={`flex items-center gap-1.5 ${c.met ? "text-green-600" : "text-muted-foreground"}`}>
                  <CheckCircle className={`h-3 w-3 ${c.met ? "text-green-600" : "text-gray-300"}`} />
                  {c.label}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="confirm-password"
                data-testid="input-confirm-password"
                type={showConfirm ? "text" : "password"}
                placeholder="Confirm new password"
                className="pl-10 pr-10"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-500" role="alert" data-testid="text-password-mismatch">Passwords don't match</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-11 gap-2"
            disabled={loading || !allChecksMet || newPassword !== confirmPassword}
            data-testid="button-reset-password"
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <>Reset password</>
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
      </div>
    </div>
  );
}
