"use client";

import { useEffect, useState } from "react";

interface UserEntry {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      setMessage("Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, role: newRole }),
      });
      if (res.ok) {
        setMessage("Role updated");
        fetchUsers();
      } else {
        const data = await res.json();
        setMessage(data.error || "Failed to update role");
      }
    } catch {
      setMessage("Network error");
    }
    setTimeout(() => setMessage(""), 3000);
  }

  async function handleToggleActive(userId: string, currentActive: boolean) {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, is_active: !currentActive }),
      });
      if (res.ok) {
        setMessage(currentActive ? "User deactivated" : "User activated");
        fetchUsers();
      } else {
        const data = await res.json();
        setMessage(data.error || "Failed to update user");
      }
    } catch {
      setMessage("Network error");
    }
    setTimeout(() => setMessage(""), 3000);
  }

  if (loading) {
    return <div className="text-[#71717a]">Loading users...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">User Management</h1>

      {message && (
        <div className="bg-[#22c55e]/10 border border-[#22c55e]/30 text-[#22c55e] text-sm rounded-lg p-3 mb-4">
          {message}
        </div>
      )}

      <div className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#27272a]">
              <th className="text-left text-xs font-medium text-[#71717a] uppercase px-4 py-3">User</th>
              <th className="text-left text-xs font-medium text-[#71717a] uppercase px-4 py-3">Role</th>
              <th className="text-left text-xs font-medium text-[#71717a] uppercase px-4 py-3">Status</th>
              <th className="text-left text-xs font-medium text-[#71717a] uppercase px-4 py-3">Joined</th>
              <th className="text-right text-xs font-medium text-[#71717a] uppercase px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-[#27272a] last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#22c55e]/20 flex items-center justify-center text-[#22c55e] text-sm font-bold">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-[#71717a]">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    className="text-sm py-1 px-2"
                  >
                    <option value="user">User</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.is_active
                        ? "bg-green-500/10 text-green-400"
                        : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    {user.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-[#71717a]">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => handleToggleActive(user.id, user.is_active)}
                      className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                        user.is_active
                          ? "text-[#ef4444] hover:bg-red-500/10"
                          : "text-[#22c55e] hover:bg-green-500/10"
                      }`}
                    >
                      {user.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[#71717a]">
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
