import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ChefHat, Flame, Coffee, Utensils, Eye, EyeOff, ArrowRight, User, Lock, ShieldCheck, ArrowLeft } from "lucide-react";
import { TableSaltLogo } from "@/components/brand/table-salt-logo";
import { motion } from "framer-motion";

const floatingIcons = [
  { Icon: ChefHat, x: "15%", y: "20%", size: 32, delay: 0, duration: 6 },
  { Icon: Flame, x: "75%", y: "15%", size: 28, delay: 1, duration: 5 },
  { Icon: Coffee, x: "25%", y: "70%", size: 24, delay: 2, duration: 7 },
  { Icon: Utensils, x: "70%", y: "65%", size: 30, delay: 0.5, duration: 5.5 },
  { Icon: Utensils, x: "50%", y: "40%", size: 36, delay: 1.5, duration: 6.5 },
];

const demoAccounts = [
  { role: "Owner", username: "owner", password: "demo123" },
  { role: "Manager", username: "manager", password: "demo123" },
  { role: "Waiter", username: "waiter", password: "demo123" },
  { role: "Kitchen", username: "kitchen", password: "demo123" },
  { role: "Accountant", username: "accountant", password: "demo123" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [needs2FA, setNeeds2FA] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(username, password, needs2FA ? totpCode : undefined);
      if ("requires2FA" in result && result.requires2FA) {
        setNeeds2FA(true);
        setLoading(false);
        return;
      }
      if ("redirectTo" in result && typeof result.redirectTo === "string") {
        navigate(result.redirectTo);
      } else {
        navigate("/");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid credentials";
      toast({
        variant: "destructive",
        title: "Login failed",
        description: message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setNeeds2FA(false);
    setTotpCode("");
  };

  const fillDemo = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setNeeds2FA(false);
    setTotpCode("");
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/70 items-center justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.08)_0%,transparent_40%)]" />

        {floatingIcons.map(({ Icon, x, y, size, delay, duration }, i) => (
          <motion.div
            key={i}
            className="absolute text-white/20"
            style={{ left: x, top: y }}
            animate={{
              y: [0, -20, 0],
              rotate: [0, 10, -10, 0],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration,
              delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <Icon size={size} />
          </motion.div>
        ))}

        <motion.div
          className="relative z-10 text-center text-white px-12"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <motion.div
            className="flex items-center justify-center mb-6"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <TableSaltLogo variant="full" animate iconSize={48} colorScheme="dark" />
          </motion.div>
          <motion.h1
            className="text-4xl font-heading font-bold mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            Table Salt
          </motion.h1>
          <motion.p
            className="text-lg text-white/80 max-w-sm mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
          >
            Season Your Restaurant Success
          </motion.p>
        </motion.div>

        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-primary/50 to-transparent" />
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-background">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <div className="lg:hidden flex items-center justify-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
            >
              <TableSaltLogo variant="full" iconSize={32} />
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <h2 className="text-2xl font-heading font-bold mb-1" data-testid="text-login-title">Welcome back</h2>
            <p className="text-muted-foreground mb-8">Sign in to your account to continue</p>
          </motion.div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!needs2FA ? (
              <>
                <motion.div
                  className="space-y-2"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                >
                  <Label htmlFor="username">Username</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="username"
                      data-testid="input-username"
                      placeholder="Enter your username"
                      className="pl-10"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>
                </motion.div>
                <motion.div
                  className="space-y-2"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.6 }}
                >
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      data-testid="input-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      className="pl-10 pr-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowPassword(!showPassword)}
                      data-testid="button-toggle-password"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </motion.div>
              </>
            ) : (
              <motion.div
                className="space-y-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <ShieldCheck className="h-5 w-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Two-Factor Authentication</p>
                    <p className="text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app or a recovery code</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="totpCode">Verification Code</Label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="totpCode"
                      data-testid="input-totp-code"
                      placeholder="Enter 6-digit code"
                      className="pl-10 text-center text-lg tracking-widest font-mono"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      autoFocus
                      required
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="gap-1"
                  data-testid="button-2fa-back"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to login
                </Button>
              </motion.div>
            )}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: needs2FA ? 0.2 : 0.7 }}
            >
              <Button
                type="submit"
                className="w-full h-11 text-base gap-2"
                disabled={loading}
                data-testid="button-login"
              >
                {loading ? (
                  <motion.div
                    className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                ) : needs2FA ? (
                  <>
                    Verify &amp; Sign In
                    <ShieldCheck className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </motion.div>
          </form>

          <motion.div
            className="mt-6 text-center text-sm text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            Don't have an account?{" "}
            <a
              href="/register"
              className="text-primary font-medium hover:underline"
              data-testid="link-register"
              onClick={(e) => {
                e.preventDefault();
                navigate("/register");
              }}
            >
              Register your restaurant
            </a>
          </motion.div>

          <motion.div
            className="mt-8 rounded-xl border border-white/10 bg-gradient-to-br from-muted/50 to-muted/30 backdrop-blur-sm p-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.9 }}
          >
            <p className="text-sm font-medium mb-3 text-foreground/80">Quick Demo Access</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.role}
                  type="button"
                  className="text-xs px-3 py-2 rounded-lg border border-border/50 bg-background/60 hover:bg-primary/10 hover:border-primary/30 transition-all duration-200 text-muted-foreground hover:text-primary font-medium"
                  data-testid={`button-demo-${acc.username}`}
                  onClick={() => fillDemo(acc.username, acc.password)}
                >
                  {acc.role}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
