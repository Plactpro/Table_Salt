import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ChefHat, Flame, Coffee, Utensils, Eye, EyeOff, ArrowRight, User, Lock, Building2, UserCircle, Mail, Phone } from "lucide-react";
import { TableSaltLogo } from "@/components/brand/table-salt-logo";
import { motion } from "framer-motion";

const floatingIcons = [
  { Icon: ChefHat, x: "15%", y: "20%", size: 32, delay: 0, duration: 6 },
  { Icon: Flame, x: "75%", y: "15%", size: 28, delay: 1, duration: 5 },
  { Icon: Coffee, x: "25%", y: "70%", size: 24, delay: 2, duration: 7 },
  { Icon: Utensils, x: "70%", y: "65%", size: 30, delay: 0.5, duration: 5.5 },
  { Icon: Utensils, x: "50%", y: "40%", size: 36, delay: 1.5, duration: 6.5 },
];

export default function RegisterPage() {
  const { register } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [restaurantName, setRestaurantName] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Passwords do not match",
        description: "Please make sure both password fields match.",
      });
      return;
    }
    setLoading(true);
    try {
      await register({ restaurantName, name, username, password, email, phone });
      navigate("/onboarding");
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
            className="flex items-center justify-center gap-3 mb-6"
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
            <h2 className="text-2xl font-heading font-bold mb-1" data-testid="text-register-title">Create your account</h2>
            <p className="text-muted-foreground mb-8">Set up your restaurant in minutes</p>
          </motion.div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <motion.div
              className="space-y-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <Label htmlFor="restaurantName">Restaurant Name</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="restaurantName"
                  data-testid="input-restaurant-name"
                  placeholder="e.g. The Grand Kitchen"
                  className="pl-10"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  required
                />
              </div>
            </motion.div>
            <motion.div
              className="space-y-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.52 }}
            >
              <Label htmlFor="name">Your Name</Label>
              <div className="relative">
                <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  data-testid="input-name"
                  placeholder="e.g. John Doe"
                  className="pl-10"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </motion.div>
            <motion.div
              className="space-y-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.54 }}
            >
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  data-testid="input-email"
                  type="email"
                  placeholder="owner@restaurant.com"
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">Used for account recovery and trial notifications</p>
            </motion.div>
            <motion.div
              className="space-y-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.56 }}
            >
              <Label htmlFor="phone">Phone / WhatsApp <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  data-testid="input-phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  className="pl-10"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">Optional — for account recovery</p>
            </motion.div>
            <motion.div
              className="space-y-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.58 }}
            >
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="username"
                  data-testid="input-username"
                  placeholder="Choose a username"
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
              transition={{ duration: 0.5, delay: 0.60 }}
            >
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  data-testid="input-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Choose a password"
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
            <motion.div
              className="space-y-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.62 }}
            >
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  data-testid="input-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  className={`pl-10 pr-10 ${passwordMismatch ? "border-destructive" : ""}`}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  data-testid="button-toggle-confirm-password"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passwordMismatch && (
                <p className="text-xs text-destructive" data-testid="text-password-match-error">
                  Passwords do not match
                </p>
              )}
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.65 }}
            >
              <Button
                type="submit"
                className="w-full h-11 text-base gap-2"
                disabled={loading || passwordMismatch}
                data-testid="button-register"
              >
                {loading ? (
                  <motion.div
                    className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                ) : (
                  <>
                    Create Account
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
            Already have an account?{" "}
            <a
              href="/login"
              className="text-primary font-medium hover:underline"
              data-testid="link-login"
              onClick={(e) => {
                e.preventDefault();
                navigate("/login");
              }}
            >
              Sign in
            </a>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
