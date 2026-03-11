import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import {
  Plus, UserCog, Search, Edit,
  Crown, ShieldCheck, ConciergeBell, ChefHat, Calculator, Users,
} from "lucide-react";

const ROLES = ["owner", "manager", "waiter", "kitchen", "accountant"] as const;

const roleBadgeColors: Record<string, string> = {
  owner: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  manager: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  waiter: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  kitchen: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  accountant: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  customer: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const roleIcons: Record<string, React.ElementType> = {
  owner: Crown,
  manager: ShieldCheck,
  waiter: ConciergeBell,
  kitchen: ChefHat,
  accountant: Calculator,
  customer: Users,
};

export default function StaffPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  const { data: staffList = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const { data: outlets = [] } = useQuery<any[]>({
    queryKey: ["/api/outlets"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Staff member added" });
      setDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/users/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Staff member updated" });
      setDialogOpen(false);
      setEditingUser(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filteredStaff = staffList.filter((s: any) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.username.toLowerCase().includes(search.toLowerCase()) ||
    s.role.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: any = {
      name: formData.get("name") as string,
      username: formData.get("username") as string,
      role: formData.get("role") as string,
      email: formData.get("email") as string || null,
      phone: formData.get("phone") as string || null,
    };

    if (editingUser) {
      const pw = formData.get("password") as string;
      if (pw) data.password = pw;
      updateMutation.mutate({ id: editingUser.id, data });
    } else {
      data.password = (formData.get("password") as string) || "demo123";
      createMutation.mutate(data);
    }
  };

  const openEdit = (staff: any) => {
    setEditingUser(staff);
    setDialogOpen(true);
  };

  const openAdd = () => {
    setEditingUser(null);
    setDialogOpen(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <UserCog className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading" data-testid="text-staff-title">Staff Management</h1>
            <p className="text-muted-foreground">Manage your team members and their roles</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-staff" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" /> Add Staff
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingUser ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  name="name"
                  defaultValue={editingUser?.name || ""}
                  required
                  data-testid="input-staff-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  name="username"
                  defaultValue={editingUser?.username || ""}
                  required
                  disabled={!!editingUser}
                  data-testid="input-staff-username"
                />
              </div>
              <div className="space-y-2">
                <Label>{editingUser ? "New Password (leave blank to keep)" : "Password"}</Label>
                <Input
                  name="password"
                  type="password"
                  required={!editingUser}
                  data-testid="input-staff-password"
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select name="role" defaultValue={editingUser?.role || "waiter"}>
                  <SelectTrigger data-testid="select-staff-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => {
                      const RoleIcon = roleIcons[r] || Users;
                      return (
                        <SelectItem key={r} value={r}>
                          <span className="flex items-center gap-2">
                            <RoleIcon className="h-3.5 w-3.5" />
                            {r.charAt(0).toUpperCase() + r.slice(1)}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  name="email"
                  type="email"
                  defaultValue={editingUser?.email || ""}
                  data-testid="input-staff-email"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  name="phone"
                  defaultValue={editingUser?.phone || ""}
                  data-testid="input-staff-phone"
                />
              </div>
              <Button type="submit" className="w-full" data-testid="button-submit-staff">
                {editingUser ? "Update" : "Add"} Staff Member
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-staff"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : filteredStaff.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No staff found</TableCell>
                </TableRow>
              ) : (
                filteredStaff.map((staff: any, index: number) => {
                  const RoleIcon = roleIcons[staff.role] || Users;
                  return (
                    <motion.tr
                      key={staff.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="border-b transition-colors hover:bg-muted/50"
                      data-testid={`row-staff-${staff.id}`}
                    >
                      <TableCell className="font-medium" data-testid={`text-staff-name-${staff.id}`}>
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${roleBadgeColors[staff.role] || "bg-gray-100"}`}>
                            <RoleIcon className="h-4 w-4" />
                          </div>
                          {staff.name}
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-staff-username-${staff.id}`}>{staff.username}</TableCell>
                      <TableCell>
                        <Badge className={`${roleBadgeColors[staff.role] || ""} gap-1`} data-testid={`badge-staff-role-${staff.id}`}>
                          <RoleIcon className="h-3 w-3" />
                          {staff.role}
                        </Badge>
                      </TableCell>
                      <TableCell>{staff.email || "—"}</TableCell>
                      <TableCell>{staff.phone || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${staff.active !== false ? "bg-green-500" : "bg-gray-400"}`} />
                          <Badge variant={staff.active !== false ? "default" : "secondary"} data-testid={`badge-staff-status-${staff.id}`}>
                            {staff.active !== false ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(staff)}
                          data-testid={`button-edit-staff-${staff.id}`}
                          className="hover:scale-110 transition-transform"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </motion.tr>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </motion.div>
  );
}
