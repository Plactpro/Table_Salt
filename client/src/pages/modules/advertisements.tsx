import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth, useSubscription } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Megaphone, Plus, Edit2, Trash2, Eye, Play, Pause,
  Upload, X, CheckCircle, Clock, AlertCircle,
  DollarSign, BarChart2, Image, Video, FileCode,
  ChevronRight, Lock, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const AD_FILE_RESTRICTIONS = {
  IMAGE: { maxSizeBytes: 2 * 1024 * 1024, allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"], label: "JPG/PNG/WEBP/GIF ≤ 2 MB" },
  VIDEO: { maxSizeBytes: 50 * 1024 * 1024, allowedTypes: ["video/mp4", "video/webm"], maxDurationSeconds: 30, label: "MP4/WEBM ≤ 50 MB, max 30s" },
  HTML_BANNER: { maxSizeBytes: 512 * 1024, allowedTypes: ["text/html"], label: "HTML ≤ 512 KB" },
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  pending_approval: "bg-blue-100 text-blue-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-slate-100 text-slate-500",
};

const DISPLAY_LOCATIONS = ["KIOSK", "KDS", "MENU_BOARD", "WAITING_SCREEN"];
const DAYS_OF_WEEK = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 7, label: "Sun" },
];

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_MIMES = ["video/mp4", "video/webm"];

async function validateAdFile(file: File): Promise<string | null> {
  const mime = file.type;
  if (IMAGE_MIMES.includes(mime)) {
    if (file.size > 2 * 1024 * 1024) return `Image must be ≤ 2 MB (got ${formatFileSize(file.size)})`;
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        if (img.naturalWidth < 800 || img.naturalHeight < 450) {
          resolve(`Image must be at least 800×450 px (got ${img.naturalWidth}×${img.naturalHeight})`);
        } else {
          resolve(null);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(img.src); resolve(null); };
      img.src = URL.createObjectURL(file);
    });
  } else if (VIDEO_MIMES.includes(mime)) {
    if (file.size > 50 * 1024 * 1024) return `Video must be ≤ 50 MB (got ${formatFileSize(file.size)})`;
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        if (video.duration > 30) {
          resolve(`Video must be ≤ 30 seconds (got ${Math.round(video.duration)}s)`);
        } else {
          resolve(null);
        }
      };
      video.onerror = () => { URL.revokeObjectURL(video.src); resolve(null); };
      video.src = URL.createObjectURL(file);
    });
  } else if (mime === "text/html") {
    if (file.size > 512 * 1024) return `HTML banner must be ≤ 512 KB (got ${formatFileSize(file.size)})`;
    return null;
  } else {
    return `File type ${mime} is not allowed`;
  }
}

function EnterpriseUpgradePrompt({ currentPlan }: { currentPlan: string }) {
  const [, navigate] = useLocation();
  const features = [
    "Display your own promotions on kiosk",
    "Earn from 3rd party advertisers",
    "Schedule ads by time and day",
    "Track ad performance and revenue",
  ];
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6" data-testid="ads-upgrade-prompt">
      <Card className="max-w-lg w-full border-2 border-dashed border-primary/30">
        <CardContent className="py-12 text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Megaphone className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-2">Advertisement Management</h2>
            <p className="text-muted-foreground">
              Your current plan: <Badge variant="outline" className="ml-1 capitalize">{currentPlan}</Badge>
            </p>
          </div>
          <div className="text-left space-y-3 bg-muted/40 rounded-lg p-4">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                <span>{f}</span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
              <Lock className="w-3.5 h-3.5" />
              <span>Available on Enterprise plan only</span>
            </div>
            <Button className="w-full gap-2" onClick={() => navigate("/settings")} data-testid="button-upgrade-enterprise">
              <Building2 className="w-4 h-4" />
              Upgrade to Enterprise
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface CampaignFormData {
  campaignType: "OWN" | "THIRD_PARTY";
  campaignName: string;
  startDate: string;
  endDate: string;
  activeHoursStart: string;
  activeHoursEnd: string;
  activeDays: number[];
  displayLocations: string[];
  displayDurationSec: number;
  displayPriority: number;
  advertiserName: string;
  advertiserContact: string;
  advertiserPhone: string;
  advertiserEmail: string;
  revenueModel: string;
  ratePerDay: string;
  ratePer1000Imp: string;
  totalContractValue: string;
  status: string;
}

const DEFAULT_FORM: CampaignFormData = {
  campaignType: "OWN",
  campaignName: "",
  startDate: new Date().toISOString().split("T")[0],
  endDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
  activeHoursStart: "00:00",
  activeHoursEnd: "23:59",
  activeDays: [1, 2, 3, 4, 5, 6, 7],
  displayLocations: ["KIOSK"],
  displayDurationSec: 10,
  displayPriority: 5,
  advertiserName: "",
  advertiserContact: "",
  advertiserPhone: "",
  advertiserEmail: "",
  revenueModel: "per_day",
  ratePerDay: "",
  ratePer1000Imp: "",
  totalContractValue: "",
  status: "draft",
};

function CampaignDialog({
  open,
  onClose,
  campaign,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  campaign?: any;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<CampaignFormData>(() =>
    campaign
      ? {
          campaignType: campaign.campaignType || "OWN",
          campaignName: campaign.campaignName || "",
          startDate: campaign.startDate?.split("T")[0] || DEFAULT_FORM.startDate,
          endDate: campaign.endDate?.split("T")[0] || DEFAULT_FORM.endDate,
          activeHoursStart: campaign.activeHoursStart || "00:00",
          activeHoursEnd: campaign.activeHoursEnd || "23:59",
          activeDays: campaign.activeDays || [1, 2, 3, 4, 5, 6, 7],
          displayLocations: campaign.displayLocations || ["KIOSK"],
          displayDurationSec: campaign.displayDurationSec || 10,
          displayPriority: campaign.displayPriority || 5,
          advertiserName: campaign.advertiserName || "",
          advertiserContact: campaign.advertiserContact || "",
          advertiserPhone: campaign.advertiserPhone || "",
          advertiserEmail: campaign.advertiserEmail || "",
          revenueModel: campaign.revenueModel || "per_day",
          ratePerDay: campaign.ratePerDay || "",
          ratePer1000Imp: campaign.ratePer1000Imp || "",
          totalContractValue: campaign.totalContractValue || "",
          status: campaign.status || "draft",
        }
      : DEFAULT_FORM
  );
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savedCampaignId, setSavedCampaignId] = useState<string | null>(campaign?.id || null);
  const [creatives, setCreatives] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const maxSteps = form.campaignType === "THIRD_PARTY" ? 4 : 3;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        ratePerDay: form.ratePerDay ? parseFloat(form.ratePerDay) : null,
        ratePer1000Imp: form.ratePer1000Imp ? parseFloat(form.ratePer1000Imp) : null,
        totalContractValue: form.totalContractValue ? parseFloat(form.totalContractValue) : null,
      };
      if (campaign?.id) {
        const r = await apiRequest("PATCH", `/api/ad-campaigns/${campaign.id}`, payload);
        if (!r.ok) throw new Error("Failed to update campaign");
        return r.json();
      } else {
        const r = await apiRequest("POST", "/api/ad-campaigns", payload);
        if (!r.ok) throw new Error("Failed to create campaign");
        return r.json();
      }
    },
    onSuccess: (data) => {
      setSavedCampaignId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/ad-campaigns"] });
    },
    onError: () => toast({ title: "Failed to save campaign", variant: "destructive" }),
  });

  const handleFileSelect = async (file: File) => {
    const err = await validateAdFile(file);
    if (err) { setUploadError(err); setUploadFile(null); return; }
    setUploadError("");
    setUploadFile(file);
  };

  const handleUpload = async () => {
    if (!uploadFile || !savedCampaignId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("creativeName", uploadFile.name);
      const r = await fetch(`/api/ad-campaigns/${savedCampaignId}/creatives`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!r.ok) throw new Error("Upload failed");
      const data = await r.json();
      setCreatives((prev) => [...prev, data]);
      setUploadFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/ad-campaigns", savedCampaignId, "creatives"] });
      toast({ title: "Creative uploaded successfully" });
    } catch (err) {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleNext = async () => {
    if (step < maxSteps) {
      const shouldSave =
        step === 2 ||
        (step === 1 && form.campaignType === "OWN") ||
        (step === 3 && form.campaignType === "THIRD_PARTY");
      if (shouldSave) {
        await saveMutation.mutateAsync();
      }
      setStep((s) => s + 1);
    } else {
      onSuccess();
      onClose();
    }
  };

  const handlePrev = () => {
    if (step > 1) setStep((s) => s - 1);
    else onClose();
  };

  const toggleDay = (day: number) => {
    setForm((f) => ({
      ...f,
      activeDays: f.activeDays.includes(day) ? f.activeDays.filter((d) => d !== day) : [...f.activeDays, day],
    }));
  };

  const toggleLocation = (loc: string) => {
    setForm((f) => ({
      ...f,
      displayLocations: f.displayLocations.includes(loc)
        ? f.displayLocations.filter((l) => l !== loc)
        : [...f.displayLocations, loc],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-campaign">
        <DialogHeader>
          <DialogTitle>{campaign ? "Edit Campaign" : "Create Ad Campaign"}</DialogTitle>
          <div className="flex gap-2 mt-2">
            {Array.from({ length: maxSteps }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  i < step ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Step {step} of {maxSteps}: {
              step === 1 ? "Campaign Type" :
              step === 2 ? "Details & Schedule" :
              step === 3 && form.campaignType === "THIRD_PARTY" ? "Advertiser Details" :
              "Creatives"
            }
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {step === 1 && (
            <div className="space-y-4" data-testid="step-campaign-type">
              <Label>Campaign Type</Label>
              <div className="grid grid-cols-2 gap-3">
                {(["OWN", "THIRD_PARTY"] as const).map((t) => (
                  <button
                    key={t}
                    data-testid={`type-${t.toLowerCase()}`}
                    onClick={() => setForm((f) => ({ ...f, campaignType: t }))}
                    className={cn(
                      "p-4 rounded-xl border-2 text-left space-y-1 transition-all",
                      form.campaignType === t ? "border-primary bg-primary/5" : "border-muted hover:border-primary/40"
                    )}
                  >
                    <div className="font-semibold text-sm">{t === "OWN" ? "Own Promotion" : "Third-Party Ad"}</div>
                    <div className="text-xs text-muted-foreground">
                      {t === "OWN"
                        ? "Display your restaurant's own promotional content"
                        : "Host advertiser content and earn revenue"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4" data-testid="step-details">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Campaign Name *</Label>
                  <Input
                    data-testid="input-campaign-name"
                    value={form.campaignName}
                    onChange={(e) => setForm((f) => ({ ...f, campaignName: e.target.value }))}
                    placeholder="e.g. Summer Specials Promo"
                  />
                </div>
                <div>
                  <Label>Start Date *</Label>
                  <Input
                    type="date"
                    data-testid="input-start-date"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>End Date *</Label>
                  <Input
                    type="date"
                    data-testid="input-end-date"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Active From</Label>
                  <Input
                    type="time"
                    value={form.activeHoursStart}
                    onChange={(e) => setForm((f) => ({ ...f, activeHoursStart: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Active Until</Label>
                  <Input
                    type="time"
                    value={form.activeHoursEnd}
                    onChange={(e) => setForm((f) => ({ ...f, activeHoursEnd: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <Label>Active Days</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {DAYS_OF_WEEK.map((d) => (
                    <button
                      key={d.value}
                      data-testid={`day-${d.label.toLowerCase()}`}
                      onClick={() => toggleDay(d.value)}
                      className={cn(
                        "w-10 h-10 rounded-full text-xs font-medium border transition-colors",
                        form.activeDays.includes(d.value)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-muted text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Display Locations</Label>
                <div className="flex gap-3 mt-1 flex-wrap">
                  {DISPLAY_LOCATIONS.map((loc) => (
                    <label key={loc} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <Checkbox
                        checked={form.displayLocations.includes(loc)}
                        onCheckedChange={() => toggleLocation(loc)}
                        data-testid={`loc-${loc.toLowerCase()}`}
                      />
                      {loc.replace("_", " ")}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Display Duration (seconds): {form.displayDurationSec}s</Label>
                  <Slider
                    min={5}
                    max={60}
                    step={5}
                    value={[form.displayDurationSec]}
                    onValueChange={([v]) => setForm((f) => ({ ...f, displayDurationSec: v }))}
                    className="mt-2"
                    data-testid="slider-duration"
                  />
                </div>
                <div>
                  <Label>Priority (1=low, 10=high): {form.displayPriority}</Label>
                  <Slider
                    min={1}
                    max={10}
                    step={1}
                    value={[form.displayPriority]}
                    onValueChange={([v]) => setForm((f) => ({ ...f, displayPriority: v }))}
                    className="mt-2"
                    data-testid="slider-priority"
                  />
                </div>
              </div>

              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    {form.campaignType === "THIRD_PARTY" && (
                      <SelectItem value="pending_approval">Submit for Approval</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 3 && form.campaignType === "THIRD_PARTY" && (
            <div className="space-y-4" data-testid="step-advertiser">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Advertiser Name *</Label>
                  <Input
                    data-testid="input-advertiser-name"
                    value={form.advertiserName}
                    onChange={(e) => setForm((f) => ({ ...f, advertiserName: e.target.value }))}
                    placeholder="Acme Corp"
                  />
                </div>
                <div>
                  <Label>Contact Person</Label>
                  <Input
                    value={form.advertiserContact}
                    onChange={(e) => setForm((f) => ({ ...f, advertiserContact: e.target.value }))}
                    placeholder="John Smith"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={form.advertiserPhone}
                    onChange={(e) => setForm((f) => ({ ...f, advertiserPhone: e.target.value }))}
                    placeholder="+1 555 000 0000"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.advertiserEmail}
                    onChange={(e) => setForm((f) => ({ ...f, advertiserEmail: e.target.value }))}
                    placeholder="advertiser@example.com"
                  />
                </div>
              </div>
              <Separator />
              <div>
                <Label>Revenue Model</Label>
                <Select value={form.revenueModel} onValueChange={(v) => setForm((f) => ({ ...f, revenueModel: v }))}>
                  <SelectTrigger data-testid="select-revenue-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_day">Per Day</SelectItem>
                    <SelectItem value="per_1000_imp">Per 1,000 Impressions (CPM)</SelectItem>
                    <SelectItem value="fixed">Fixed Contract</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(form.revenueModel === "per_day" || form.revenueModel === "fixed") && (
                  <div>
                    <Label>Rate per Day</Label>
                    <Input
                      type="number"
                      value={form.ratePerDay}
                      onChange={(e) => setForm((f) => ({ ...f, ratePerDay: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                )}
                {form.revenueModel === "per_1000_imp" && (
                  <div>
                    <Label>Rate per 1K Impressions</Label>
                    <Input
                      type="number"
                      value={form.ratePer1000Imp}
                      onChange={(e) => setForm((f) => ({ ...f, ratePer1000Imp: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                )}
                <div>
                  <Label>Total Contract Value</Label>
                  <Input
                    type="number"
                    value={form.totalContractValue}
                    onChange={(e) => setForm((f) => ({ ...f, totalContractValue: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          )}

          {((step === 3 && form.campaignType === "OWN") || (step === 4 && form.campaignType === "THIRD_PARTY")) && (
            <div className="space-y-4" data-testid="step-creatives">
              <div className="bg-muted/40 rounded-lg p-4 text-sm space-y-2">
                <p className="font-medium">File Requirements</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>🖼 <strong>Images:</strong> {AD_FILE_RESTRICTIONS.IMAGE.label}, min 800×450</li>
                  <li>🎬 <strong>Videos:</strong> {AD_FILE_RESTRICTIONS.VIDEO.label}</li>
                  <li>📄 <strong>HTML Banner:</strong> {AD_FILE_RESTRICTIONS.HTML_BANNER.label}</li>
                </ul>
              </div>

              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) handleFileSelect(f);
                }}
                data-testid="dropzone-creative"
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Drop file or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">Images, Videos, or HTML banners</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,text/html"
                  onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }}
                  data-testid="input-file-creative"
                />
              </div>

              {uploadError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3" data-testid="error-upload">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {uploadError}
                </div>
              )}

              {uploadFile && !uploadError && (
                <div className="flex items-center gap-3 bg-muted/40 rounded-lg p-3" data-testid="preview-upload">
                  {uploadFile.type.startsWith("image/") ? (
                    <img src={URL.createObjectURL(uploadFile)} alt="Preview" className="w-16 h-16 object-cover rounded" />
                  ) : (
                    <div className="w-16 h-16 bg-muted rounded flex items-center justify-center">
                      {uploadFile.type.startsWith("video/") ? <Video className="w-6 h-6" /> : <FileCode className="w-6 h-6" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{uploadFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(uploadFile.size)} · {uploadFile.type}</p>
                  </div>
                  <Button size="sm" onClick={handleUpload} disabled={uploading || !savedCampaignId} data-testid="button-upload-creative">
                    {uploading ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              )}

              {!savedCampaignId && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded p-2">
                  Save campaign details first before uploading creatives.
                </p>
              )}

              {creatives.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Uploaded Creatives ({creatives.length})</p>
                  <div className="grid grid-cols-3 gap-2">
                    {creatives.map((c) => (
                      <div key={c.id} className="relative rounded-lg overflow-hidden border bg-muted" data-testid={`creative-thumb-${c.id}`}>
                        {c.fileType === "IMAGE" ? (
                          <img src={c.fileUrl} alt={c.creativeName} className="w-full h-24 object-cover" />
                        ) : (
                          <div className="w-full h-24 flex items-center justify-center">
                            {c.fileType === "VIDEO" ? <Video className="w-8 h-8 text-muted-foreground" /> : <FileCode className="w-8 h-8 text-muted-foreground" />}
                          </div>
                        )}
                        <p className="text-xs p-1 truncate">{c.creativeName || c.fileName}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handlePrev} data-testid="button-prev-step">
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          <Button
            onClick={handleNext}
            disabled={
              (step === 2 && (!form.campaignName || !form.startDate || !form.endDate)) ||
              saveMutation.isPending
            }
            data-testid="button-next-step"
          >
            {saveMutation.isPending ? "Saving..." : step === maxSteps ? "Done" : "Next"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreativesDialog({ campaign, open, onClose }: { campaign: any; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: creatives = [], refetch } = useQuery<any[]>({
    queryKey: ["/api/ad-campaigns", campaign.id, "creatives"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/ad-campaigns/${campaign.id}/creatives`);
      if (!r.ok) throw new Error("Failed to load creatives");
      return r.json();
    },
    enabled: open,
  });

  const handleFileSelect = async (file: File) => {
    const err = await validateAdFile(file);
    if (err) { setUploadError(err); setUploadFile(null); return; }
    setUploadError("");
    setUploadFile(file);
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      const r = await fetch(`/api/ad-campaigns/${campaign.id}/creatives`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!r.ok) throw new Error("Upload failed");
      setUploadFile(null);
      refetch();
      toast({ title: "Creative uploaded" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (creativeId: string) => {
      const r = await apiRequest("DELETE", `/api/ad-campaigns/${campaign.id}/creatives/${creativeId}`);
      if (!r.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => { refetch(); toast({ title: "Creative deleted" }); },
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ creativeId, displayOrder }: { creativeId: string; displayOrder: number }) => {
      const r = await apiRequest("PATCH", `/api/ad-campaigns/${campaign.id}/creatives/${creativeId}`, { displayOrder });
      if (!r.ok) throw new Error("Failed to reorder");
    },
    onSuccess: () => refetch(),
  });

  const moveCreative = (index: number, direction: "up" | "down") => {
    const sorted = [...creatives].sort((a: any, b: any) => a.displayOrder - b.displayOrder);
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sorted.length) return;
    const current = sorted[index];
    const target = sorted[newIndex];
    reorderMutation.mutate({ creativeId: current.id, displayOrder: target.displayOrder });
    reorderMutation.mutate({ creativeId: target.id, displayOrder: current.displayOrder });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-creatives">
        <DialogHeader>
          <DialogTitle>Creatives — {campaign.campaignName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-1">
            <p className="font-medium text-sm">File Requirements</p>
            <p>🖼 Images: JPG/PNG/WEBP/GIF ≤ 2 MB, min 800×450</p>
            <p>🎬 Videos: MP4/WEBM ≤ 50 MB, max 30s</p>
            <p>📄 HTML Banner ≤ 512 KB</p>
          </div>

          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]); }}
            data-testid="dropzone-creative-manage"
          >
            <Upload className="w-6 h-6 mx-auto mb-1 text-muted-foreground" />
            <p className="text-sm">Drop or click to upload</p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,text/html"
              onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }}
            />
          </div>

          {uploadError && (
            <div className="text-sm text-red-600 bg-red-50 rounded p-2">{uploadError}</div>
          )}

          {uploadFile && !uploadError && (
            <div className="flex items-center gap-3 bg-muted/40 rounded-lg p-3">
              <p className="flex-1 text-sm truncate">{uploadFile.name} ({formatFileSize(uploadFile.size)})</p>
              <Button size="sm" onClick={handleUpload} disabled={uploading}>
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            </div>
          )}

          {creatives.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-6">No creatives yet. Upload some above.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Drag order sets display sequence. Use arrows to reorder.</p>
              {[...creatives].sort((a: any, b: any) => a.displayOrder - b.displayOrder).map((c: any, idx: number, arr: any[]) => (
                <div key={c.id} className="flex items-center gap-3 border rounded-lg p-2 group" data-testid={`creative-${c.id}`}>
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveCreative(idx, "up")}
                      disabled={idx === 0 || reorderMutation.isPending}
                      className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                      data-testid={`creative-up-${c.id}`}
                      title="Move up"
                    >
                      <ChevronRight className="w-3 h-3 rotate-[-90deg]" />
                    </button>
                    <button
                      onClick={() => moveCreative(idx, "down")}
                      disabled={idx === arr.length - 1 || reorderMutation.isPending}
                      className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                      data-testid={`creative-down-${c.id}`}
                      title="Move down"
                    >
                      <ChevronRight className="w-3 h-3 rotate-90" />
                    </button>
                  </div>
                  <span className="text-xs text-muted-foreground w-4 text-center">{idx + 1}</span>
                  {c.fileType === "IMAGE" ? (
                    <img src={c.fileUrl} alt={c.creativeName} className="w-16 h-10 object-cover rounded" />
                  ) : (
                    <div className="w-16 h-10 bg-muted rounded flex items-center justify-center">
                      {c.fileType === "VIDEO" ? <Video className="w-5 h-5 text-muted-foreground" /> : <FileCode className="w-5 h-5 text-muted-foreground" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{c.creativeName || c.fileName}</p>
                    <p className="text-xs text-muted-foreground">{c.fileSizeDisplay} · {c.fileType}{c.durationSeconds ? ` · ${c.durationSeconds}s` : ""}</p>
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(c.id)}
                    className="text-red-400 hover:text-red-600 p-1 rounded"
                    data-testid={`delete-creative-${c.id}`}
                    title="Delete"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RevenueRecordDialog({ campaigns, open, onClose, onSuccess }: { campaigns: any[]; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    campaignId: "",
    advertiserName: "",
    revenuePeriod: "monthly",
    periodStart: "",
    periodEnd: "",
    impressions: "",
    amountEarned: "",
    paymentStatus: "pending",
    invoiceNumber: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/ad-revenue", {
        ...form,
        impressions: form.impressions ? parseInt(form.impressions) : 0,
        amountEarned: form.amountEarned ? parseFloat(form.amountEarned) : null,
      });
      if (!r.ok) throw new Error("Failed to create record");
      return r.json();
    },
    onSuccess: () => { toast({ title: "Revenue record created" }); onSuccess(); onClose(); },
    onError: () => toast({ title: "Failed to create record", variant: "destructive" }),
  });

  const thirdPartyCampaigns = campaigns.filter((c) => c.campaignType === "THIRD_PARTY");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent data-testid="dialog-revenue-record">
        <DialogHeader><DialogTitle>Create Revenue Record</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Campaign</Label>
            <Select value={form.campaignId} onValueChange={(v) => setForm((f) => ({ ...f, campaignId: v }))}>
              <SelectTrigger data-testid="select-campaign">
                <SelectValue placeholder="Select campaign" />
              </SelectTrigger>
              <SelectContent>
                {thirdPartyCampaigns.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.campaignName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Period Start</Label>
              <Input type="date" value={form.periodStart} onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))} />
            </div>
            <div>
              <Label>Period End</Label>
              <Input type="date" value={form.periodEnd} onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))} />
            </div>
            <div>
              <Label>Impressions</Label>
              <Input type="number" value={form.impressions} onChange={(e) => setForm((f) => ({ ...f, impressions: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <Label>Amount Earned</Label>
              <Input type="number" value={form.amountEarned} onChange={(e) => setForm((f) => ({ ...f, amountEarned: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <Label>Invoice Number</Label>
              <Input value={form.invoiceNumber} onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))} placeholder="INV-001" />
            </div>
            <div>
              <Label>Payment Status</Label>
              <Select value={form.paymentStatus} onValueChange={(v) => setForm((f) => ({ ...f, paymentStatus: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.campaignId || mutation.isPending} data-testid="button-save-revenue-record">
            {mutation.isPending ? "Saving..." : "Save Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignCard({ campaign, onEdit, onDelete, onViewCreatives, onStatusChange }: {
  campaign: any;
  onEdit: () => void;
  onDelete: () => void;
  onViewCreatives: () => void;
  onStatusChange: (status: string) => void;
}) {
  return (
    <div
      className="bg-card border rounded-xl p-4 flex items-start gap-3 hover:shadow-sm transition-shadow"
      data-testid={`campaign-card-${campaign.id}`}
    >
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Megaphone className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-sm truncate" data-testid={`text-campaign-name-${campaign.id}`}>{campaign.campaignName}</h3>
          <Badge className={cn("text-xs", STATUS_COLORS[campaign.status] || "bg-gray-100")} data-testid={`badge-status-${campaign.id}`}>
            {campaign.status.replace("_", " ")}
          </Badge>
          {campaign.campaignType === "THIRD_PARTY" && (
            <Badge variant="outline" className="text-xs">3rd Party</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : ""} →{" "}
          {campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : ""}
        </p>
        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <BarChart2 className="w-3 h-3" /> {campaign.totalImpressions || 0} impressions
          </span>
          {campaign.campaignType === "THIRD_PARTY" && campaign.totalContractValue && (
            <span className="flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> {parseFloat(campaign.totalContractValue).toFixed(2)} contract
            </span>
          )}
          <span>{(campaign.displayLocations || []).join(", ")}</span>
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onViewCreatives} data-testid={`button-creatives-${campaign.id}`} title="Manage Creatives">
          <Image className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} data-testid={`button-edit-${campaign.id}`} title="Edit">
          <Edit2 className="w-3.5 h-3.5" />
        </Button>
        {campaign.status === "active" ? (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onStatusChange("paused")} data-testid={`button-pause-${campaign.id}`} title="Pause">
            <Pause className="w-3.5 h-3.5" />
          </Button>
        ) : campaign.status === "paused" || campaign.status === "draft" ? (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onStatusChange("active")} data-testid={`button-activate-${campaign.id}`} title="Activate">
            <Play className="w-3.5 h-3.5" />
          </Button>
        ) : null}
        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={onDelete} data-testid={`button-delete-${campaign.id}`} title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function AdvertisementsPage() {
  const { tenant, isLoading: authLoading } = useAuth();
  const { tier } = useSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("campaigns");
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<any>(null);
  const [creativesFor, setCreativesFor] = useState<any>(null);
  const [showRevenueDialog, setShowRevenueDialog] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "OWN" | "THIRD_PARTY">("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const isEnterprise = tenant?.plan === "enterprise";

  const { data: campaigns = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/ad-campaigns"],
    enabled: isEnterprise,
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/ad-campaigns");
      if (!r.ok) throw new Error("Failed to load campaigns");
      return r.json();
    },
  });

  const { data: revenueRecords = [], refetch: refetchRevenue } = useQuery<any[]>({
    queryKey: ["/api/ad-revenue"],
    enabled: isEnterprise,
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/ad-revenue");
      if (!r.ok) throw new Error("Failed to load revenue");
      return r.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/ad-campaigns/${id}`);
      if (!r.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ad-campaigns"] });
      toast({ title: "Campaign deleted" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const r = await apiRequest("PATCH", `/api/ad-campaigns/${id}`, { status });
      if (!r.ok) throw new Error("Failed to update");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ad-campaigns"] }),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("PATCH", `/api/ad-revenue/${id}`, {
        paymentStatus: "paid",
        paidAt: new Date().toISOString(),
      });
      if (!r.ok) throw new Error("Failed to update");
    },
    onSuccess: () => { refetchRevenue(); toast({ title: "Marked as paid" }); },
  });

  const filteredCampaigns = campaigns.filter((c) => {
    if (filterType !== "all" && c.campaignType !== filterType) return false;
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    return true;
  });

  const ownCampaigns = filteredCampaigns.filter((c) => c.campaignType === "OWN");
  const thirdPartyCampaigns = filteredCampaigns.filter((c) => c.campaignType === "THIRD_PARTY");
  const hasThirdParty = campaigns.some((c) => c.campaignType === "THIRD_PARTY");

  const totalEarned = revenueRecords.reduce((s, r) => s + parseFloat(r.amountEarned || 0), 0);
  const totalPaid = revenueRecords.filter((r) => r.paymentStatus === "paid").reduce((s, r) => s + parseFloat(r.amountEarned || 0), 0);
  const totalPending = totalEarned - totalPaid;

  if (authLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  if (!isEnterprise) {
    return <EnterpriseUpgradePrompt currentPlan={tenant?.plan || "basic"} />;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto" data-testid="ads-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-primary" />
            Advertisements
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage ad campaigns and earn from third-party advertisers</p>
        </div>
        <Button onClick={() => { setEditingCampaign(null); setShowCampaignDialog(true); }} data-testid="button-create-campaign" className="gap-2">
          <Plus className="w-4 h-4" />
          New Campaign
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card data-testid="stat-total-campaigns">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Campaigns</p>
            <p className="text-2xl font-bold">{campaigns.length}</p>
            <p className="text-xs text-muted-foreground">{campaigns.filter((c) => c.status === "active").length} active</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-impressions">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Impressions</p>
            <p className="text-2xl font-bold">{campaigns.reduce((s, c) => s + (c.totalImpressions || 0), 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-revenue">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Ad Revenue Earned</p>
            <p className="text-2xl font-bold">{totalEarned.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{totalPending.toFixed(2)} pending</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="campaigns" data-testid="tab-campaigns">Campaigns</TabsTrigger>
          {hasThirdParty && (
            <TabsTrigger value="revenue" data-testid="tab-revenue">Revenue</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
              <SelectTrigger className="w-40" data-testid="filter-type">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="OWN">Own Promotions</SelectItem>
                <SelectItem value="THIRD_PARTY">Third Party</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40" data-testid="filter-status">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="pending_approval">Pending Approval</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading campaigns...</div>
          ) : (
            <div className="space-y-6">
              {(filterType === "all" || filterType === "OWN") && (
                <div>
                  <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <Megaphone className="w-4 h-4" /> Own Promotions
                    <Badge variant="secondary">{ownCampaigns.length}</Badge>
                  </h2>
                  {ownCampaigns.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-xl" data-testid="empty-own-campaigns">
                      No own promotions yet. Create one to display your content on kiosks.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {ownCampaigns.map((c) => (
                        <CampaignCard
                          key={c.id}
                          campaign={c}
                          onEdit={() => { setEditingCampaign(c); setShowCampaignDialog(true); }}
                          onDelete={() => deleteMutation.mutate(c.id)}
                          onViewCreatives={() => setCreativesFor(c)}
                          onStatusChange={(status) => statusMutation.mutate({ id: c.id, status })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(filterType === "all" || filterType === "THIRD_PARTY") && (
                <div>
                  <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <DollarSign className="w-4 h-4" /> Third-Party Ads
                    <Badge variant="secondary">{thirdPartyCampaigns.length}</Badge>
                  </h2>
                  {thirdPartyCampaigns.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-xl" data-testid="empty-third-party-campaigns">
                      No third-party ads yet. Add advertiser campaigns to earn revenue.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {thirdPartyCampaigns.map((c) => (
                        <CampaignCard
                          key={c.id}
                          campaign={c}
                          onEdit={() => { setEditingCampaign(c); setShowCampaignDialog(true); }}
                          onDelete={() => deleteMutation.mutate(c.id)}
                          onViewCreatives={() => setCreativesFor(c)}
                          onStatusChange={(status) => statusMutation.mutate({ id: c.id, status })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total Earned</p>
                <p className="text-xl font-bold text-green-600">{totalEarned.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total Paid</p>
                <p className="text-xl font-bold">{totalPaid.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Balance Due</p>
                <p className="text-xl font-bold text-amber-600">{totalPending.toFixed(2)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setShowRevenueDialog(true)} className="gap-2" data-testid="button-create-revenue-record">
              <Plus className="w-4 h-4" /> Add Revenue Record
            </Button>
          </div>

          {revenueRecords.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="empty-revenue">
              No revenue records yet.
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Campaign</th>
                    <th className="text-left px-4 py-3 font-medium">Period</th>
                    <th className="text-right px-4 py-3 font-medium">Impressions</th>
                    <th className="text-right px-4 py-3 font-medium">Amount</th>
                    <th className="text-center px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {revenueRecords.map((r: any) => (
                    <tr key={r.id} data-testid={`revenue-row-${r.id}`} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <p className="font-medium">{r.campaignName || "—"}</p>
                        <p className="text-xs text-muted-foreground">{r.advertiserName}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.periodStart ? new Date(r.periodStart).toLocaleDateString() : "—"} →{" "}
                        {r.periodEnd ? new Date(r.periodEnd).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">{(r.impressions || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-medium">{parseFloat(r.amountEarned || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          className={cn(
                            r.paymentStatus === "paid" ? "bg-green-100 text-green-700" :
                            r.paymentStatus === "overdue" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                          )}
                          data-testid={`badge-payment-${r.id}`}
                        >
                          {r.paymentStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.paymentStatus !== "paid" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => markPaidMutation.mutate(r.id)}
                            disabled={markPaidMutation.isPending}
                            data-testid={`button-mark-paid-${r.id}`}
                          >
                            Mark Paid
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {showCampaignDialog && (
        <CampaignDialog
          open={showCampaignDialog}
          onClose={() => { setShowCampaignDialog(false); setEditingCampaign(null); }}
          campaign={editingCampaign}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/ad-campaigns"] })}
        />
      )}

      {creativesFor && (
        <CreativesDialog
          campaign={creativesFor}
          open={!!creativesFor}
          onClose={() => setCreativesFor(null)}
        />
      )}

      {showRevenueDialog && (
        <RevenueRecordDialog
          campaigns={campaigns}
          open={showRevenueDialog}
          onClose={() => setShowRevenueDialog(false)}
          onSuccess={refetchRevenue}
        />
      )}
    </div>
  );
}

export function AdsEnterpriseGate() {
  const { tenant } = useAuth() as any;
  return <EnterpriseUpgradePrompt currentPlan={tenant?.plan || "basic"} />;
}
