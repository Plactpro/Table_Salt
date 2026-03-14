import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Send,
  Loader2,
  CheckCircle2,
  MessageSquare,
  Building2,
  Mail,
  Phone,
  MapPin,
  User,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ContactSalesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BUSINESS_TYPES = [
  "Enterprise",
  "QSR",
  "Food Truck",
  "Cafe",
  "Fine Dining",
  "Casual Dining",
  "Cloud Kitchen",
  "Other",
];

const OUTLET_OPTIONS = ["1", "2-5", "6-10", "11-25", "26-50", "50+"];

const CONTACT_METHODS = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "whatsapp", label: "WhatsApp" },
];

const HEARD_FROM_OPTIONS = [
  "Web Search",
  "Referral",
  "Social Media",
  "Other",
];

const SUBSCRIPTION_OPTIONS = ["Basic", "Standard", "Premium", "Enterprise", "Not Sure"];

interface FormData {
  fullName: string;
  businessName: string;
  businessType: string;
  numOutlets: string;
  location: string;
  email: string;
  phone: string;
  preferredContact: string;
  heardFrom: string;
  subscriptionInterest: string[];
  message: string;
  wantsDemo: boolean;
  wantsUpdates: boolean;
}

interface FormErrors {
  [key: string]: string;
}

const initialFormData: FormData = {
  fullName: "",
  businessName: "",
  businessType: "",
  numOutlets: "",
  location: "",
  email: "",
  phone: "",
  preferredContact: "email",
  heardFrom: "",
  subscriptionInterest: [],
  message: "",
  wantsDemo: false,
  wantsUpdates: false,
};

function validateForm(data: FormData): FormErrors {
  const errors: FormErrors = {};
  if (!data.fullName.trim()) errors.fullName = "Full name is required";
  if (!data.businessName.trim()) errors.businessName = "Business name is required";
  if (!data.businessType) errors.businessType = "Please select a business type";
  if (!data.location.trim()) errors.location = "Location is required";
  if (!data.email.trim()) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = "Please enter a valid email address";
  }
  if (data.phone && !/^[+]?[\d\s()-]{7,20}$/.test(data.phone)) {
    errors.phone = "Please enter a valid phone number";
  }
  if (!data.message.trim()) {
    errors.message = "Please describe your requirements";
  } else if (data.message.trim().length < 20) {
    errors.message = "Please provide more detail (at least 20 characters)";
  }
  return errors;
}

export default function ContactSalesModal({ open, onOpenChange }: ContactSalesModalProps) {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const submitMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await apiRequest("POST", "/api/contact-sales", {
        ...data,
        userAgent: navigator.userAgent,
        sourcePage: window.location.pathname,
      });
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: "Inquiry sent successfully!" });
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't send your inquiry",
        description: err.message || "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const updateField = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const toggleSubscription = useCallback((tier: string) => {
    setFormData((prev) => ({
      ...prev,
      subscriptionInterest: prev.subscriptionInterest.includes(tier)
        ? prev.subscriptionInterest.filter((t) => t !== tier)
        : [...prev.subscriptionInterest, tier],
    }));
  }, []);

  const handleSubmit = useCallback(() => {
    const validationErrors = validateForm(formData);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    submitMutation.mutate(formData);
  }, [formData, submitMutation]);

  const handleReset = useCallback(() => {
    setFormData(initialFormData);
    setErrors({});
    setSubmitted(false);
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setTimeout(() => {
      setSubmitted(false);
      setFormData(initialFormData);
      setErrors({});
    }, 300);
  }, [onOpenChange]);

  const isFormValid =
    formData.fullName.trim() &&
    formData.businessName.trim() &&
    formData.businessType &&
    formData.location.trim() &&
    formData.email.trim() &&
    formData.message.trim().length >= 20;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 border-0" data-testid="dialog-contact-sales">
        <div className="bg-gradient-to-br from-teal-600 via-teal-700 to-teal-800 px-6 py-5 rounded-t-lg">
          <DialogHeader>
            <DialogTitle className="text-white text-xl font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Contact Our Sales Team
            </DialogTitle>
            <p className="text-teal-100 text-sm mt-1">
              Tell us about your restaurant and we'll find the perfect plan for you.
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
                className="text-center py-10"
                data-testid="contact-sales-success"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                >
                  <CheckCircle2 className="h-16 w-16 text-teal-500 mx-auto mb-4" />
                </motion.div>
                <h3 className="text-xl font-semibold mb-2">Thank You!</h3>
                <p className="text-muted-foreground mb-6">
                  Our sales team will contact you shortly. We're excited to help your restaurant thrive!
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button variant="outline" onClick={handleReset} data-testid="button-send-another">
                    Send Another Inquiry
                  </Button>
                  <Button onClick={handleClose} className="bg-teal-600 hover:bg-teal-700" data-testid="button-close-success">
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
                className="space-y-5"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="flex items-center gap-1.5 mb-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      Full Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={formData.fullName}
                      onChange={(e) => updateField("fullName", e.target.value)}
                      placeholder="John Smith"
                      data-testid="input-sales-fullname"
                    />
                    {errors.fullName && <p className="text-destructive text-xs mt-1" data-testid="error-fullname">{errors.fullName}</p>}
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5 mb-1.5">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      Business Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={formData.businessName}
                      onChange={(e) => updateField("businessName", e.target.value)}
                      placeholder="Restaurant name"
                      data-testid="input-sales-businessname"
                    />
                    {errors.businessName && <p className="text-destructive text-xs mt-1" data-testid="error-businessname">{errors.businessName}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-1.5">Business Type <span className="text-destructive">*</span></Label>
                    <Select value={formData.businessType} onValueChange={(v) => updateField("businessType", v)}>
                      <SelectTrigger data-testid="select-sales-businesstype">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {BUSINESS_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.businessType && <p className="text-destructive text-xs mt-1">{errors.businessType}</p>}
                  </div>
                  <div>
                    <Label className="mb-1.5">Number of Outlets</Label>
                    <Select value={formData.numOutlets} onValueChange={(v) => updateField("numOutlets", v)}>
                      <SelectTrigger data-testid="select-sales-outlets">
                        <SelectValue placeholder="Select range" />
                      </SelectTrigger>
                      <SelectContent>
                        {OUTLET_OPTIONS.map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="flex items-center gap-1.5 mb-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      Country / City <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={formData.location}
                      onChange={(e) => updateField("location", e.target.value)}
                      placeholder="e.g. Dubai, UAE"
                      data-testid="input-sales-location"
                    />
                    {errors.location && <p className="text-destructive text-xs mt-1">{errors.location}</p>}
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5 mb-1.5">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      Email Address <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      placeholder="john@restaurant.com"
                      data-testid="input-sales-email"
                    />
                    {errors.email && <p className="text-destructive text-xs mt-1" data-testid="error-email">{errors.email}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="flex items-center gap-1.5 mb-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      Phone / WhatsApp
                    </Label>
                    <Input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      placeholder="+1 234 567 8900"
                      data-testid="input-sales-phone"
                    />
                    {errors.phone && <p className="text-destructive text-xs mt-1">{errors.phone}</p>}
                  </div>
                  <div>
                    <Label className="mb-1.5">Preferred Contact Method</Label>
                    <Select value={formData.preferredContact} onValueChange={(v) => updateField("preferredContact", v)}>
                      <SelectTrigger data-testid="select-sales-contact-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTACT_METHODS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="mb-1.5">How did you hear about us?</Label>
                  <Select value={formData.heardFrom} onValueChange={(v) => updateField("heardFrom", v)}>
                    <SelectTrigger data-testid="select-sales-heardfrom">
                      <SelectValue placeholder="Select option" />
                    </SelectTrigger>
                    <SelectContent>
                      {HEARD_FROM_OPTIONS.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2">Subscription Interest</Label>
                  <div className="flex flex-wrap gap-2" data-testid="checkbox-group-subscription">
                    {SUBSCRIPTION_OPTIONS.map((tier) => (
                      <label
                        key={tier}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${
                          formData.subscriptionInterest.includes(tier)
                            ? "bg-teal-50 border-teal-300 text-teal-800 dark:bg-teal-950 dark:border-teal-700 dark:text-teal-200"
                            : "bg-background border-border hover:bg-accent"
                        }`}
                      >
                        <Checkbox
                          checked={formData.subscriptionInterest.includes(tier)}
                          onCheckedChange={() => toggleSubscription(tier)}
                          className="h-3.5 w-3.5"
                          data-testid={`checkbox-tier-${tier.toLowerCase().replace(/\s/g, "-")}`}
                        />
                        {tier}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="mb-1.5">
                    Message / Requirements <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    value={formData.message}
                    onChange={(e) => updateField("message", e.target.value)}
                    placeholder="Tell us about your restaurant, current challenges, and what you're looking for in a management system..."
                    rows={4}
                    data-testid="textarea-sales-message"
                  />
                  {errors.message && <p className="text-destructive text-xs mt-1" data-testid="error-message">{errors.message}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{formData.message.length} characters (min 20)</p>
                </div>

                <div className="space-y-3 border-t pt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.wantsDemo}
                      onCheckedChange={(checked) => updateField("wantsDemo", !!checked)}
                      data-testid="checkbox-wants-demo"
                    />
                    <span className="text-sm flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      I'd like a product demo
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.wantsUpdates}
                      onCheckedChange={(checked) => updateField("wantsUpdates", !!checked)}
                      data-testid="checkbox-wants-updates"
                    />
                    <span className="text-sm">Subscribe to updates and offers</span>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2 border-t">
                  <Button variant="outline" onClick={handleClose} data-testid="button-cancel-sales">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={!isFormValid || submitMutation.isPending}
                    className="bg-teal-600 hover:bg-teal-700 text-white min-w-[140px]"
                    data-testid="button-submit-sales"
                  >
                    {submitMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Inquiry
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
