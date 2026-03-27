import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("account");
  const { toast } = useToast();
  const qc = useQueryClient();

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
      toast({ title: t("sessionSignedOut") });
    },
    onError: (err: Error) => {
      toast({ title: t("failedRevokeSession"), description: err.message, variant: "destructive" });
    },
  });

  const revokeAll = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/sessions/logout-all");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/sessions"] });
      toast({ title: t("allOtherSessionsSignedOut") });
    },
    onError: (err: Error) => {
      toast({ title: t("failedSignOutSessions"), description: err.message, variant: "destructive" });
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
              {t("activeSessions")}
              {sessionCount > 0 && (
                <Badge variant="secondary" data-testid="badge-session-count">
                  {t("deviceCount", { count: sessionCount })}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {t("devicesSignedIn")}
              {otherSessions.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400 font-medium ml-1">
                  {t("signedInOnDevices", { count: sessionCount })}
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
              {t("logoutAllOtherSessions")}
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
            {t("noActiveSessionsFound")}
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
                        {session.userAgent || t("unknownDevice")}
                      </span>
                      {session.isCurrent && (
                        <Badge
                          variant="outline"
                          className="text-green-700 border-green-300 text-xs"
                          data-testid={`badge-current-${session.sessionId}`}
                        >
                          {t("thisDevice")}
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
                          {t("lastActive")}: {new Date(session.lastActive).toLocaleString()}
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
                    {t("signOut")}
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
  const { t } = useTranslation("account");
  const { user } = useAuth();

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="heading-account">{t("myAccount")}</h1>
        <p className="text-muted-foreground text-sm">{t("manageProfileSessions")}</p>
      </div>

      <Card data-testid="card-profile">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t("profile")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("name")}</span>
            <span className="font-medium" data-testid="text-profile-name">{user?.name || "—"}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("username")}</span>
            <span className="font-medium" data-testid="text-profile-username">@{user?.username || "—"}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("role")}</span>
            <Badge variant="secondary" data-testid="badge-profile-role">{user?.role || "—"}</Badge>
          </div>
        </CardContent>
      </Card>

      <ActiveSessionsCard />

      <Card data-testid="card-security-tip">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            {t("securityTips")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>{t("securityTip1")}</li>
            <li>{t("securityTip2")}</li>
            <li>{t("securityTip3")}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
