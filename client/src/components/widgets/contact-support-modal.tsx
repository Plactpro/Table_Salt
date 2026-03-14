import { useState, useCallback, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Headset,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ContactSupportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ISSUE_TYPES = [
  { value: "pos_not_loading", label: "POS not loading" },
  { value: "billing_issue", label: "Billing issue" },
  { value: "menu_sync_problem", label: "Menu sync problem" },
  { value: "staff_scheduling", label: "Staff scheduling" },
  { value: "reservation_conflict", label: "Reservation conflict" },
  { value: "inventory_issue", label: "Inventory issue" },
  { value: "delivery_issue", label: "Delivery issue" },
  { value: "account_access", label: "Account access" },
  { value: "performance", label: "Performance / speed" },
  { value: "other", label: "Other" },
];

const URGENCY_LEVELS = [
  { value: "low", label: "Low", color: "text-green-600", description: "General question" },
  { value: "medium", label: "Medium", color: "text-amber-600", description: "Standard issue" },
  { value: "high", label: "High", color: "text-orange-600", description: "Business impacted" },
  { value: "critical", label: "Critical", color: "text-red-600", description: "System down" },
];

interface QuickFormData {
  issueType: string;
  urgency: string;
  shortDescription: string;
  email: string;
  phone: string;
  message: string;
}

interface FormErrors {
  [key: string]: string;
}

const initialFormData: QuickFormData = {
  issueType: "",
  urgency: "medium",
  shortDescription: "",
  email: "",
  phone: "",
  message: "",
};

export default function ContactSupportModal({ open, onOpenChange }: ContactSupportModalProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState<QuickFormData>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [ticketRef, setTicketRef] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const { toast } = useToast();

  const tenantData = useMemo(() => {
    if (!user) return null;
    return {
      tenantId: user.tenantId,
      userId: user.id,
      userName: user.name,
      subscriptionTier: (user as any).tenant?.plan || "",
      businessType: (user as any).tenant?.businessType || "",
    };
  }, [user]);

  const submitMutation = useMutation({
    mutationFn: async (data: QuickFormData) => {
      const res = await apiRequest("POST", "/api/contact-support", {
        ...data,
        ...(tenantData || {}),
        browserInfo: navigator.userAgent,
        sourcePage: window.location.pathname,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSubmitted(true);
      setTicketRef(data.referenceNumber || "");
      toast({ title: "Support ticket created!" });
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't create support ticket",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateField = useCallback(<K extends keyof QuickFormData>(field: K, value: QuickFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};
    if (!formData.issueType) errs.issueType = "Please select an issue type";
    if (!formData.shortDescription.trim() || formData.shortDescription.trim().length < 5)
      errs.shortDescription = "Please describe the issue (min 5 characters)";
    if (!formData.email.trim()) {
      errs.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errs.email = "Enter a valid email";
    }
    return errs;
  }, [formData]);

  const handleSubmit = useCallback(() => {
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    submitMutation.mutate(formData);
  }, [formData, submitMutation, validate]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setTimeout(() => {
      setSubmitted(false);
      setFormData(initialFormData);
      setErrors({});
      setShowDetails(false);
      setTicketRef("");
    }, 300);
  }, [onOpenChange]);

  const handleNewTicket = useCallback(() => {
    setSubmitted(false);
    setFormData(initialFormData);
    setErrors({});
    setShowDetails(false);
    setTicketRef("");
  }, []);

  const isFormValid = formData.issueType && formData.shortDescription.trim().length >= 5 && formData.email.trim();

  const urgencyInfo = URGENCY_LEVELS.find((u) => u.value === formData.urgency);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0 border-0" data-testid="dialog-contact-support">
        <div className="bg-gradient-to-br from-cyan-600 via-cyan-700 to-teal-800 px-6 py-5 rounded-t-lg">
          <DialogHeader>
            <DialogTitle className="text-white text-xl font-semibold flex items-center gap-2">
              <Headset className="h-5 w-5" />
              Contact Support
            </DialogTitle>
            <p className="text-cyan-100 text-sm mt-1">
              {user ? `Logged in as ${user.name}` : "We're here to help"}
            </p>
          </DialogHeader>
        </div>

        <div className="px-6 py-5">
          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="text-center py-8"
                data-testid="support-ticket-success"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                >
                  <CheckCircle2 className="h-16 w-16 text-cyan-500 mx-auto mb-4" />
                </motion.div>
                <h3 className="text-xl font-semibold mb-1">Support Ticket Created!</h3>
                {ticketRef && (
                  <p className="text-lg font-mono text-cyan-700 dark:text-cyan-400 mb-3" data-testid="text-ticket-reference">
                    Reference: #{ticketRef}
                  </p>
                )}
                <div className="bg-muted/50 rounded-lg p-3 mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Expected response: Within 2 hours
                </div>
                <div className="flex items-center justify-center gap-3">
                  <Button variant="outline" onClick={handleNewTicket} data-testid="button-new-ticket">
                    Submit Another
                  </Button>
                  <Button onClick={handleClose} className="bg-cyan-600 hover:bg-cyan-700" data-testid="button-close-support-success">
                    Close
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div>
                  <Label className="mb-1.5">Issue Type <span className="text-destructive">*</span></Label>
                  <Select value={formData.issueType} onValueChange={(v) => updateField("issueType", v)}>
                    <SelectTrigger data-testid="select-support-issue-type">
                      <SelectValue placeholder="What do you need help with?" />
                    </SelectTrigger>
                    <SelectContent>
                      {ISSUE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.issueType && <p className="text-destructive text-xs mt-1">{errors.issueType}</p>}
                </div>

                <div>
                  <Label className="mb-1.5">Short Description <span className="text-destructive">*</span></Label>
                  <Input
                    value={formData.shortDescription}
                    onChange={(e) => updateField("shortDescription", e.target.value.slice(0, 200))}
                    placeholder="Briefly describe the issue"
                    data-testid="input-support-description"
                  />
                  {errors.shortDescription && <p className="text-destructive text-xs mt-1">{errors.shortDescription}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{formData.shortDescription.length}/200</p>
                </div>

                <div>
                  <Label className="mb-1.5">Urgency</Label>
                  <Select value={formData.urgency} onValueChange={(v) => updateField("urgency", v)}>
                    <SelectTrigger data-testid="select-support-urgency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {URGENCY_LEVELS.map((u) => (
                        <SelectItem key={u.value} value={u.value}>
                          <span className="flex items-center gap-2">
                            <AlertCircle className={`h-3.5 w-3.5 ${u.color}`} />
                            {u.label} — {u.description}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {urgencyInfo && (
                    <p className={`text-xs mt-1 ${urgencyInfo.color}`}>{urgencyInfo.description}</p>
                  )}
                </div>

                <div>
                  <Label className="flex items-center gap-1.5 mb-1.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    placeholder="your@email.com"
                    data-testid="input-support-email"
                  />
                  {errors.email && <p className="text-destructive text-xs mt-1">{errors.email}</p>}
                </div>

                <button
                  type="button"
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowDetails(!showDetails)}
                  data-testid="button-toggle-details"
                >
                  {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {showDetails ? "Hide" : "Show"} additional details
                </button>

                <AnimatePresence>
                  {showDetails && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-4"
                    >
                      <div>
                        <Label className="flex items-center gap-1.5 mb-1.5">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          Phone
                        </Label>
                        <Input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => updateField("phone", e.target.value)}
                          placeholder="+1 234 567 8900"
                          data-testid="input-support-phone"
                        />
                      </div>

                      <div>
                        <Label className="mb-1.5">Detailed Description</Label>
                        <Textarea
                          value={formData.message}
                          onChange={(e) => updateField("message", e.target.value)}
                          placeholder="Provide more details about the issue, steps to reproduce, etc."
                          rows={4}
                          data-testid="textarea-support-message"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {tenantData && (
                  <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground text-xs mb-1">Auto-detected context:</p>
                    <p>User: {tenantData.userName}</p>
                    {tenantData.subscriptionTier && <p>Plan: {tenantData.subscriptionTier}</p>}
                    <p>Page: {window.location.pathname}</p>
                    <p>Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2 border-t">
                  <Button variant="outline" onClick={handleClose} data-testid="button-cancel-support">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={!isFormValid || submitMutation.isPending}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white min-w-[140px]"
                    data-testid="button-submit-support"
                  >
                    {submitMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Submit Ticket
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
