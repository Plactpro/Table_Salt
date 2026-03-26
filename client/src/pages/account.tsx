import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Monitor, LogOut, Smartphone, Globe, User, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

// Session shape as returned by GET /api/auth/sessions
interface ActiveSession {
  sessionId: string;
  userAgent?: string;
  ipAddress?: string;
  lastActive?: string;
  isCurrent?: boolean;
}

function ActiveSessionsCard() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // PR-001: No custom queryFn — inherits the default getQueryFn which has fast/standard/heavy
  // timeout enforcement and dispatches the api-timeout event on abort.
  const { data: sessions, isLoading } = useQuery<ActiveSession[]>({
    queryKey: ["/api/auth/sessions"],
  });

  const revokeOne = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await apiRequest("DELETE", `/api/auth/sessions/${sessionId}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/sessions"] });
      toast({ title: "Session signed out" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to revoke session", description: err.message, variant: "destructive" });
    },
  });

  // PR-001: Use POST /api/auth/sessions/logout-all which rotates session_token to invalidate
  // all other sessions (concurrent session detection contract)
  const revokeAll = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/sessions/logout-all");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/sessions"] });
      toast({ title: "All other sessions signed out" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to sign out sessions", description: err.message, variant: "destructive" });
    },
  });

  const otherSessions = (sessions || []).filter((s) => !s.isCurrent);
  const sessionCount = sessions?.length ?? 0;

  return (
    <Card data-testid="card-active-sessions">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Active Sessions
              {sessionCount > 0 && (
                <Badge variant="secondary" data-testid="badge-session-count">
                  {sessionCount} device{sessionCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Devices currently signed in to your account.
              {otherSessions.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400 font-medium ml-1">
                  You are signed in on {sessionCount} device{sessionCount !== 1 ? "s" : ""}.
                </span>
              )}
            </CardDescription>
          </div>
          {otherSessions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              onClick={() => revokeAll.mutate()}
              disabled={revokeAll.isPending}
              data-testid="button-logout-all-sessions"
            >
              {revokeAll.isPending
                ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                : <LogOut className="h-4 w-4 mr-1" />}
              Log out all other sessions
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-sessions">
            No active sessions found
          </p>
        ) : (
          <div className="space-y-3" data-testid="list-sessions">
            {sessions.map((session) => (
              <div
                key={session.sessionId}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  session.isCurrent
                    ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
                    : "border-border bg-muted/30"
                }`}
                data-testid={`row-session-${session.sessionId}`}
              >
                <div className="flex items-center gap-3">
                  {session.userAgent?.toLowerCase().includes("mobile") ? (
                    <Smartphone className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <Monitor className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  )}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" data-testid={`text-device-${session.sessionId}`}>
                        {session.userAgent || "Unknown device"}
                      </span>
                      {session.isCurrent && (
                        <Badge
                          variant="outline"
                          className="text-green-700 border-green-300 text-xs"
                          data-testid={`badge-current-${session.sessionId}`}
                        >
                          This device
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {session.ipAddress && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {session.ipAddress}
                        </span>
                      )}
                      {session.lastActive && (
                        <span className="text-xs text-muted-foreground">
                          Last active: {new Date(session.lastActive).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {!session.isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                    onClick={() => revokeOne.mutate(session.sessionId)}
                    disabled={revokeOne.isPending}
                    data-testid={`button-revoke-session-${session.sessionId}`}
                  >
                    <LogOut className="h-4 w-4 mr-1" />
                    Sign out
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AccountPage() {
  const { user } = useAuth();

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="heading-account">My Account</h1>
        <p className="text-muted-foreground text-sm">Manage your profile and active sessions</p>
      </div>

      <Card data-testid="card-profile">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium" data-testid="text-profile-name">{user?.name || "—"}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Username</span>
            <span className="font-medium" data-testid="text-profile-username">@{user?.username || "—"}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Role</span>
            <Badge variant="secondary" data-testid="badge-profile-role">{user?.role || "—"}</Badge>
          </div>
        </CardContent>
      </Card>

      <ActiveSessionsCard />

      <Card data-testid="card-security-tip">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            Security Tips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>If you see an unfamiliar session, sign it out immediately.</li>
            <li>Never share your password or PIN with anyone.</li>
            <li>Use a unique password and change it regularly.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
