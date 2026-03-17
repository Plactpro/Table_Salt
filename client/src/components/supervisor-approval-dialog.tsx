import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldAlert, Loader2, KeyRound, Smartphone } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface SupervisorApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: string;
  actionLabel: string;
  onApproved: (supervisorId: string, credentials: { username: string; password: string; otpApprovalToken?: string }) => void;
}

export default function SupervisorApprovalDialog({
  open,
  onOpenChange,
  action,
  actionLabel,
  onApproved,
}: SupervisorApprovalDialogProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otpUsername, setOtpUsername] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpChallengeId, setOtpChallengeId] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("credentials");

  const resetForm = () => {
    setUsername("");
    setPassword("");
    setOtpUsername("");
    setOtpCode("");
    setOtpChallengeId("");
    setOtpSent(false);
    setError("");
    setLoading(false);
    setActiveTab("credentials");
  };

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/supervisor/verify", { username, password, action });
      const data = await res.json();
      if (data.verified) {
        onApproved(data.supervisor.id, { username, password });
        resetForm();
        onOpenChange(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChallenge = async () => {
    if (!otpUsername) return;
    setError("");
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/supervisor/otp-challenge", { username: otpUsername, action });
      const data = await res.json();
      setOtpChallengeId(data.challengeId || "");
      setOtpSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/supervisor/otp-verify", { challengeId: otpChallengeId, code: otpCode, action });
      const data = await res.json();
      if (data.verified) {
        onApproved(data.supervisor.id, { username: otpUsername, password: "", otpApprovalToken: data.approvalToken });
        resetForm();
        onOpenChange(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-sm" data-testid="supervisor-approval-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-orange-500" />
            Supervisor Approval Required
          </DialogTitle>
          <DialogDescription>
            The action "{actionLabel}" requires supervisor authorization.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="credentials" data-testid="tab-credentials">
              <KeyRound className="h-3.5 w-3.5 mr-1.5" />Credentials
            </TabsTrigger>
            <TabsTrigger value="otp" data-testid="tab-otp">
              <Smartphone className="h-3.5 w-3.5 mr-1.5" />OTP
            </TabsTrigger>
          </TabsList>
          <TabsContent value="credentials">
            <form onSubmit={handleCredentialSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="supervisor-username">Supervisor Username</Label>
                <Input
                  id="supervisor-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter supervisor username"
                  autoComplete="off"
                  data-testid="input-supervisor-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supervisor-password">Password</Label>
                <Input
                  id="supervisor-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="off"
                  data-testid="input-supervisor-password"
                />
              </div>
              {error && activeTab === "credentials" && (
                <p className="text-sm text-red-600" data-testid="text-supervisor-error">{error}</p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-approval">
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || !username || !password} data-testid="button-verify-supervisor">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Verify & Approve
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
          <TabsContent value="otp">
            {!otpSent ? (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="otp-username">Supervisor Username</Label>
                  <Input
                    id="otp-username"
                    value={otpUsername}
                    onChange={(e) => setOtpUsername(e.target.value)}
                    placeholder="Enter supervisor username"
                    autoComplete="off"
                    data-testid="input-otp-username"
                  />
                </div>
                {error && activeTab === "otp" && (
                  <p className="text-sm text-red-600" data-testid="text-otp-error">{error}</p>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button onClick={handleOtpChallenge} disabled={loading || !otpUsername} data-testid="button-send-otp">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Send OTP
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <form onSubmit={handleOtpVerify} className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  A one-time code has been sent. Enter it below to approve.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="otp-code">OTP Code</Label>
                  <Input
                    id="otp-code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                    autoComplete="off"
                    data-testid="input-otp-code"
                  />
                </div>
                {error && activeTab === "otp" && (
                  <p className="text-sm text-red-600" data-testid="text-otp-error">{error}</p>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => { setOtpSent(false); setOtpCode(""); }}>Back</Button>
                  <Button type="submit" disabled={loading || !otpCode} data-testid="button-verify-otp">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Verify OTP
                  </Button>
                </DialogFooter>
              </form>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
