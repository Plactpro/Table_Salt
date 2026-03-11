import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { UtensilsCrossed } from "lucide-react";

export default function RegisterPage() {
  const { register } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [restaurantName, setRestaurantName] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register({ restaurantName, name, username, password });
      navigate("/");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: err.message || "Could not create account",
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
            <span className="text-2xl font-heading font-bold">ServeOS</span>
          </div>
          <CardTitle data-testid="text-register-title">Register your restaurant</CardTitle>
          <CardDescription>Create an account to start managing your restaurant</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="restaurantName">Restaurant Name</Label>
              <Input
                id="restaurantName"
                data-testid="input-restaurant-name"
                placeholder="e.g. The Grand Kitchen"
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                data-testid="input-name"
                placeholder="e.g. John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                data-testid="input-username"
                placeholder="Choose a username"
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
                placeholder="Choose a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              data-testid="button-register"
            >
              {loading ? "Creating account..." : "Create Account"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <a
              href="/login"
              className="text-primary hover:underline"
              data-testid="link-login"
              onClick={(e) => {
                e.preventDefault();
                navigate("/login");
              }}
            >
              Sign in
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
