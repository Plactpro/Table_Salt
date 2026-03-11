import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { UtensilsCrossed } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: err.message || "Invalid credentials",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <UtensilsCrossed className="h-8 w-8 text-primary" />
            <span className="text-2xl font-heading font-bold" data-testid="text-brand">ServeOS</span>
          </div>
          <CardTitle data-testid="text-login-title">Sign in to your account</CardTitle>
          <CardDescription>Enter your credentials to access the dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                data-testid="input-username"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                data-testid="input-password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              data-testid="button-login"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <a
              href="/register"
              className="text-primary hover:underline"
              data-testid="link-register"
              onClick={(e) => {
                e.preventDefault();
                navigate("/register");
              }}
            >
              Register your restaurant
            </a>
          </div>
          <div className="mt-6 p-3 rounded-md bg-muted text-sm">
            <p className="font-medium mb-1">Demo Accounts:</p>
            <p className="text-muted-foreground">owner / demo123</p>
            <p className="text-muted-foreground">manager / demo123</p>
            <p className="text-muted-foreground">waiter / demo123</p>
            <p className="text-muted-foreground">kitchen / demo123</p>
            <p className="text-muted-foreground">accountant / demo123</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
