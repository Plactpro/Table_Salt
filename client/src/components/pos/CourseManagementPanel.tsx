import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Flame, ChefHat, Clock, CheckCircle2, Lock, Utensils } from "lucide-react";

interface CourseItem {
  id: string;
  name: string;
  quantity: number | null;
  cookingStatus?: string | null;
  status?: string | null;
  estimatedReadyAt?: string | null;
}

interface OrderCourse {
  courseNumber: number;
  label: string;
  status: "waiting" | "fired" | "cooking" | "served";
  items: CourseItem[];
  etaMinutes?: number | null;
  firedAt?: string | null;
}

interface CourseData {
  orderId: string;
  tableNumber: number | null;
  courses: OrderCourse[];
}

interface CartItem {
  id?: string;
  name: string;
  quantity?: number;
}

function getCourseStatusInfo(status: string) {
  switch (status) {
    case "waiting": return { label: "Waiting", icon: Lock, cls: "text-gray-500", badgeCls: "bg-gray-100 text-gray-600" };
    case "fired": return { label: "Sent to Kitchen", icon: Flame, cls: "text-orange-600", badgeCls: "bg-orange-100 text-orange-700" };
    case "cooking": return { label: "Cooking", icon: Clock, cls: "text-blue-600", badgeCls: "bg-blue-100 text-blue-700" };
    case "served": return { label: "Served", icon: CheckCircle2, cls: "text-green-600", badgeCls: "bg-green-100 text-green-700" };
    default: return { label: status, icon: Utensils, cls: "text-gray-500", badgeCls: "bg-gray-100 text-gray-600" };
  }
}

function SetCoursesDialog({
  open, onClose, orderId, items, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  items: CartItem[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const courseItems = items.map((item, idx) => ({
      orderItemId: item.id ?? `${idx}`,
      courseNumber: assignments[item.id ?? `${idx}`] ?? 1,
      name: item.name,
    }));
    try {
      const res = await fetch(`/api/orders/${orderId}/courses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courses: courseItems }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Courses saved" });
      onSaved();
      onClose();
    } catch (_) {
      toast({ title: "Could not save courses — backend feature pending", variant: "default" });
      onClose();
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent data-testid="dialog-set-courses">
        <DialogHeader>
          <DialogTitle>Set Courses</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Assign each item to a course number for the kitchen.</p>
          {items.map((item, idx) => {
            const key = item.id ?? `${idx}`;
            return (
              <div key={key} className="flex items-center justify-between gap-3" data-testid={`course-assign-row-${key}`}>
                <span className="text-sm flex-1">{item.quantity ? `${item.quantity}× ` : ""}{item.name}</span>
                <Select
                  value={String(assignments[key] ?? 1)}
                  onValueChange={v => setAssignments(prev => ({ ...prev, [key]: Number(v) }))}
                >
                  <SelectTrigger className="w-36 h-8" data-testid={`select-course-${key}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Course 1 — Starters</SelectItem>
                    <SelectItem value="2">Course 2 — Mains</SelectItem>
                    <SelectItem value="3">Course 3 — Desserts</SelectItem>
                    <SelectItem value="4">Course 4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} data-testid="button-save-courses">Save Courses</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CourseManagementPanel({
  orderId,
  tableNumber,
  items = [],
}: {
  orderId: string;
  tableNumber?: number | null;
  items?: CartItem[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showSetCourses, setShowSetCourses] = useState(false);

  const { data: courseData, refetch, isLoading } = useQuery<CourseData>({
    queryKey: ["/api/orders", orderId, "courses"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/orders/${orderId}/courses`);
        if (res.ok) return res.json();
      } catch (_) {}
      return { orderId, tableNumber: tableNumber ?? null, courses: [] };
    },
    enabled: !!orderId,
  });

  useRealtimeEvent("kds:course_fired", () => refetch());
  useRealtimeEvent("order:updated", () => refetch());

  const fireMut = useMutation({
    mutationFn: async (courseNumber: number) => {
      const res = await fetch(`/api/orders/${orderId}/courses/${courseNumber}/fire`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to fire course");
      return res.json();
    },
    onSuccess: (_, courseNumber) => {
      qc.invalidateQueries({ queryKey: ["/api/orders", orderId, "courses"] });
      toast({ title: `Course ${courseNumber} fired to kitchen` });
    },
    onError: () => toast({ title: "Could not fire course — backend feature pending", variant: "default" }),
  });

  const courses = courseData?.courses ?? [];
  const hasCourses = courses.length > 0;

  const label = tableNumber ? `Table ${tableNumber}` : "Order";

  if (isLoading) {
    return <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-3" data-testid="course-management-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChefHat className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">{label} — Course Management</h3>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setShowSetCourses(true)}
          data-testid="button-set-courses"
        >
          Set Courses
        </Button>
      </div>

      {!hasCourses ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            <Utensils className="h-6 w-6 mx-auto mb-2 opacity-40" />
            No courses set. Click "Set Courses" to organize items by course.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {courses.map(course => {
            const info = getCourseStatusInfo(course.status);
            const Icon = info.icon;
            const canFire = course.status === "waiting";
            const prevCourse = courses.find(c => c.courseNumber === course.courseNumber - 1);
            const prevServed = !prevCourse || prevCourse.status === "served" || prevCourse.status === "cooking";

            return (
              <Card key={course.courseNumber} className={`${course.status === "served" ? "opacity-60" : ""}`} data-testid={`card-course-${course.courseNumber}`}>
                <CardHeader className="py-2 px-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${info.cls}`} />
                      <span className="text-sm font-semibold">
                        Course {course.courseNumber}: {course.label}
                      </span>
                      <Badge className={`text-xs ${info.badgeCls}`}>{info.label}</Badge>
                    </div>
                    {canFire && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs px-2"
                        onClick={() => fireMut.mutate(course.courseNumber)}
                        disabled={fireMut.isPending || !prevServed}
                        data-testid={`button-fire-course-${course.courseNumber}`}
                      >
                        <Flame className="h-3 w-3 mr-1" />
                        🔥 Fire Course {course.courseNumber} to Kitchen
                      </Button>
                    )}
                  </div>
                </CardHeader>
                {course.items.length > 0 && (
                  <CardContent className="py-1 px-3">
                    <div className="flex flex-wrap gap-1">
                      {course.items.map(item => (
                        <span key={item.id} className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                          {item.quantity ? `${item.quantity}× ` : ""}{item.name}
                          {course.status === "cooking" && item.estimatedReadyAt && (
                            <span className="ml-1 text-blue-600 font-mono">
                              · {Math.max(0, Math.floor((new Date(item.estimatedReadyAt).getTime() - Date.now()) / 60000))}m left
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <SetCoursesDialog
        open={showSetCourses}
        onClose={() => setShowSetCourses(false)}
        orderId={orderId}
        items={items}
        onSaved={refetch}
      />
    </div>
  );
}
