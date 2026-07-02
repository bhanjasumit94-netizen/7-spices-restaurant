import { useState } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  Shield,
  KeyRound,
  Lock,
  Mail,
  Phone,
  Check,
  X,
  RotateCcw,
} from "lucide-react";
import { Card, Button, Input, Modal, Badge, Select } from "../components/UI";
import { useToast } from "../components/Toaster";
import { Store, useStore } from "../lib/store";
import { User, Role } from "../lib/types";
import { useAuth } from "../lib/auth";
import {
  ROLE_LABEL,
  canEditUser,
  canDeleteUser,
  canResetPassword,
  isSuperAdmin,
} from "../lib/permissions";
import { hashPassword } from "../lib/crypto";

export default function Users() {
  const { user: currentUser } = useAuth();
  const users = useStore("users", Store.listUsers);
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [viewing, setViewing] = useState<User | null>(null);
  const [form, setForm] = useState<{ name: string; email: string; password: string; role: Role; phone: string }>({
    name: "",
    email: "",
    password: "",
    role: "staff",
    phone: "",
  });
  const [resetPwd, setResetPwd] = useState("");

  const myRole = currentUser?.role;

  const openNew = () => {
    setEditing(null);
    // Admin cannot create a Super Admin account
    const defaultRole: Role = myRole === "super_admin" ? "admin" : "manager";
    setForm({ name: "", email: "", password: "", role: defaultRole, phone: "" });
    setOpen(true);
  };

  const openEdit = (u: User) => {
    if (!canEditUser(myRole, u.role)) {
      toast.push(isSuperAdmin(u.role) ? "Only Super Admin can edit this account" : "Not authorized", "error");
      return;
    }
    setEditing(u);
    // Never pre-fill the existing password (it's a hash, and showing it would leak credentials).
    setForm({ name: u.name, email: u.email, password: "", role: u.role, phone: u.phone || "" });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name || !form.email || (!editing && !form.password)) {
      toast.push("Fill required fields", "error");
      return;
    }
    // Prevent non-Super-Admin from creating/editing Super Admin
    if (form.role === "super_admin" && !isSuperAdmin(myRole)) {
      toast.push("Only Super Admin can create Super Admin accounts", "error");
      return;
    }
    if (editing) {
      if (editing.role === "super_admin" && form.role !== "super_admin" && !isSuperAdmin(myRole)) {
        toast.push("Only Super Admin can change Super Admin role", "error");
        return;
      }
      const patch: Partial<User> = {
        name: form.name,
        email: form.email,
        role: form.role,
        phone: form.phone,
      };
      // Only update the password when the admin actually typed a new one.
      if (form.password) {
        patch.password = await hashPassword(form.password);
      }
      Store.updateUser(editing.id, patch);
      toast.push("User updated", "success");
    } else {
      if (Store.findUserByEmail(form.email)) return toast.push("Email already exists", "error");
      const hashed = await hashPassword(form.password);
      Store.addUser({ id: Store.uid("user"), name: form.name, email: form.email, password: hashed, role: form.role, phone: form.phone, active: true, createdAt: Date.now() });
      toast.push("User created", "success");
    }
    setOpen(false);
  };

  const remove = (u: User) => {
    if (u.id === currentUser?.id) return toast.push("You can't delete your own account", "error");
    if (!canDeleteUser(myRole, u.role)) {
      toast.push(isSuperAdmin(u.role) ? "Only Super Admin can delete this account" : "Not authorized", "error");
      return;
    }
    if (u.role === "super_admin" && users.filter((x) => x.role === "super_admin").length === 1) {
      return toast.push("Cannot delete the last Super Admin account", "error");
    }
    if (!confirm(`Delete user "${u.name}"?`)) return;
    Store.deleteUser(u.id);
    toast.push("User deleted", "info");
  };

  const toggleActive = (u: User) => {
    if (!canEditUser(myRole, u.role)) {
      toast.push(isSuperAdmin(u.role) ? "Only Super Admin can modify this account" : "Not authorized", "error");
      return;
    }
    Store.updateUser(u.id, { active: !u.active });
    toast.push(`${u.name} ${!u.active ? "enabled" : "disabled"}`, "info");
  };

  const doReset = async () => {
    if (!resetPwd || !resetting) return toast.push("Enter a new password", "error");
    if (!canResetPassword(myRole, resetting.role)) {
      toast.push(isSuperAdmin(resetting.role) ? "Only Super Admin can reset this password" : "Not authorized", "error");
      return;
    }
    const hashed = await hashPassword(resetPwd);
    Store.updateUser(resetting.id, { password: hashed });
    toast.push(`Password reset for ${resetting.name}`, "success");
    setResetting(null);
    setResetPwd("");
  };

  // Note: the full system reset (Business Reset / Factory Reset) has been
  // moved to the dedicated /reset-system page. That page is the SINGLE
  // entry point — it requires typing "RESET" + the Super Admin password
  // and produces a full audit-log entry. The button on this Users page
  // only navigates to that page; it does NOT trigger the reset directly.

  // Build the role options based on who is creating the user.
  const roleOptions: { value: Role; label: string }[] = [
    ...(isSuperAdmin(myRole) ? [{ value: "super_admin" as Role, label: "Super Admin" }] : []),
    ...(myRole === "super_admin" || myRole === "admin" ? [{ value: "admin" as Role, label: "Admin" }] : []),
    { value: "manager", label: "Manager" },
    { value: "staff", label: "Staff" },
    { value: "waiter", label: "Waiter" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">User Management</h2>
          <p className="text-sm text-neutral-500">Create managers, admins, staff & waiters</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Super-Admin-only link to the dedicated Reset System page.
              Other roles don't see this button at all. */}
          {isSuperAdmin(myRole) && (
            <Button
              variant="danger"
              onClick={() => (window.location.hash = "#/reset-system")}
              title="Reset Business Data or Factory Reset (Super Admin only)"
            >
              <RotateCcw className="h-4 w-4" /> Reset System
            </Button>
          )}
          <Button variant="primary" onClick={openNew}>
            <Plus className="h-4 w-4" /> Add User
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isProtected = u.role === "super_admin" && !isSuperAdmin(myRole);
                const canEdit = canEditUser(myRole, u.role);
                const canDelete = canDeleteUser(myRole, u.role) && u.id !== currentUser?.id;
                const canReset = canResetPassword(myRole, u.role);
                return (
                  <tr key={u.id} className={isProtected ? "opacity-80" : ""}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                            isProtected
                              ? "bg-neutral-600"
                              : "bg-gold-gradient"
                          }`}
                        >
                          {isProtected ? <Lock className="h-3.5 w-3.5" /> : u.name[0]?.toUpperCase()}
                        </div>
                        <span className="font-medium">{u.name}</span>
                        {isProtected && (
                          <Badge tone="warning">
                            <Lock className="h-3 w-3" /> Protected
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="text-xs">{u.email}</td>
                    <td>
                      <Badge
                        tone={
                          u.role === "super_admin"
                            ? "gold"
                            : u.role === "admin"
                            ? "info"
                            : u.role === "manager"
                            ? "info"
                            : "neutral"
                        }
                      >
                        <Shield className="h-3 w-3" /> {ROLE_LABEL[u.role]}
                      </Badge>
                    </td>
                    <td className="text-xs">{u.phone || "—"}</td>
                    <td>
                      <button
                        onClick={() => toggleActive(u)}
                        disabled={!canEdit}
                        className={canEdit ? "" : "cursor-not-allowed opacity-60"}
                      >
                        <Badge tone={u.active ? "success" : "danger"}>
                          {u.active ? "Active" : "Disabled"}
                        </Badge>
                      </button>
                    </td>
                    <td className="text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="flex gap-1">
                        {canReset && (
                          <button
                            onClick={() => {
                              setResetting(u);
                              setResetPwd("");
                            }}
                            title="Reset Password"
                            className="p-1.5 rounded hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-600"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setViewing(u)}
                          title="View Details"
                          className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        >
                          <Shield className="h-3.5 w-3.5" />
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => openEdit(u)}
                            title="Edit"
                            className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => remove(u)}
                            title="Delete"
                            className="p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {isProtected && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] text-neutral-500"
                            title="Only Super Admin can modify this account"
                          >
                            <Lock className="h-3 w-3" /> Read Only
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit User" : "Add User"} size="md">
        <div className="space-y-3">
          <Input label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Input label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
          <Input
            label={editing ? "Password (leave blank to keep current)" : "Password"}
            value={form.password}
            onChange={(v) => setForm({ ...form, password: v })}
            type="password"
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Role"
              value={form.role}
              onChange={(v) => setForm({ ...form, role: v as Role })}
              options={roleOptions}
            />
            <Input label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!resetting}
        onClose={() => setResetting(null)}
        title={`Reset Password for ${resetting?.name}`}
        size="sm"
      >
        <Input label="New Password" value={resetPwd} onChange={setResetPwd} type="password" />
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Button variant="outline" onClick={() => setResetting(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={doReset}>
            Reset Password
          </Button>
        </div>
      </Modal>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title="User Details" size="sm">
        {viewing && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-full bg-gold-gradient text-white flex items-center justify-center text-xl font-bold">
                {viewing.name[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-lg">{viewing.name}</p>
                <Badge tone="gold">
                  <Shield className="h-3 w-3" /> {ROLE_LABEL[viewing.role]}
                </Badge>
              </div>
            </div>
            <div className="space-y-2 text-sm border-t border-neutral-200 dark:border-neutral-800 pt-3">
              <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                <Mail className="h-4 w-4 text-neutral-400" />
                {viewing.email}
              </div>
              {viewing.phone && (
                <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                  <Phone className="h-4 w-4 text-neutral-400" />
                  {viewing.phone}
                </div>
              )}
              <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                {viewing.active ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-500" /> Active
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4 text-rose-500" /> Disabled
                  </>
                )}
              </div>
              <div className="text-xs text-neutral-500 pt-2">
                Created: {new Date(viewing.createdAt).toLocaleString()}
              </div>
            </div>
            {viewing.role === "super_admin" && !isSuperAdmin(myRole) && (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3 text-xs flex gap-2">
                <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>This is a protected Super Admin account. You cannot view or modify sensitive data.</span>
              </div>
            )}
            <Button variant="outline" onClick={() => setViewing(null)} className="w-full">
              Close
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
