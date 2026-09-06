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
  const [message, setMessage] = useState({ text: "", type: "" });

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      setMessage({ text: "Failed to load users", type: "error" });
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
        setMessage({ text: "Role updated successfully", type: "success" });
        fetchUsers();
      } else {
        const data = await res.json();
        setMessage({ text: data.error || "Failed to update role", type: "error" });
      }
    } catch {
      setMessage({ text: "Network error", type: "error" });
    }
    setTimeout(() => setMessage({ text: "", type: "" }), 3000);
  }

  async function handleToggleActive(userId: string, currentActive: boolean) {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, is_active: !currentActive }),
      });
      if (res.ok) {
        setMessage({ text: currentActive ? "User deactivated" : "User activated", type: "success" });
        fetchUsers();
      } else {
        const data = await res.json();
        setMessage({ text: data.error || "Failed to update user", type: "error" });
      }
    } catch {
      setMessage({ text: "Network error", type: "error" });
    }
    setTimeout(() => setMessage({ text: "", type: "" }), 3000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="flex items-center gap-3">
          <svg className="animate-spin w-5 h-5 text-leaf" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-stale">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="page-header mb-1">
            Users<span className="text-ember">.</span>
          </h1>
          <p className="text-sm text-stale">
            {users.length} registered user{users.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Message banner */}
      {message.text && (
        <div
          className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm mb-4 transition-all"
          style={{
            background: message.type === "success" ? "rgba(20,160,95,0.10)" : "rgba(217,59,62,0.10)",
            border: `1px solid ${message.type === "success" ? "rgba(20,160,95,0.3)" : "rgba(217,59,62,0.3)"}`,
            color: message.type === "success" ? "#0B7A45" : "#B3272A",
          }}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {message.type === "success" ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            )}
          </svg>
          {message.text}
        </div>
      )}

      {/* Table */}
      <div className="dash-card rounded-2xl overflow-hidden bg-panel">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--ghostline)" }}>
              {["User", "Role", "Status", "Joined", "Actions"].map((h) => (
                <th
                  key={h}
                  className={`px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-stale ${h === "Actions" ? "text-right" : ""}`}
                  style={{ fontFamily: "var(--font-label)", background: "var(--ink)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user, i) => (
              <tr
                key={user.id}
                style={{
                  borderBottom: i < users.length - 1 ? "1px solid var(--ghostline)" : "none",
                }}
                className="transition-colors"
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "var(--ink)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "";
                }}
              >
                {/* User */}
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-leaf2"
                      style={{ background: "rgba(20,160,95,0.15)" }}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-chalk">
                        {user.name}
                      </p>
                      <p className="text-xs text-stale">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </td>

                {/* Role */}
                <td className="px-5 py-4">
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    className="text-sm rounded-lg px-3 py-1.5 font-medium transition-all border border-chalk/10"
                    style={{
                      fontFamily: "var(--font-label)",
                    }}
                  >
                    <option value="user">User</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </td>

                {/* Status */}
                <td className="px-5 py-4">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={{
                      background: user.is_active ? "rgba(20,160,95,0.12)" : "rgba(217,59,62,0.12)",
                      color: user.is_active ? "#0B7A45" : "#B3272A",
                      fontFamily: "var(--font-label)",
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: user.is_active ? "#14A05F" : "#D93B3E" }}
                    />
                    {user.is_active ? "Active" : "Inactive"}
                  </span>
                </td>

                {/* Joined */}
                <td className="px-5 py-4">
                  <p className="text-sm text-stale">
                    {new Date(user.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </td>

                {/* Actions */}
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => handleToggleActive(user.id, user.is_active)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150"
                      style={{
                        color: user.is_active ? "#B3272A" : "#0B7A45",
                        background: user.is_active ? "rgba(217,59,62,0.10)" : "rgba(20,160,95,0.12)",
                        border: `1px solid ${user.is_active ? "rgba(217,59,62,0.3)" : "rgba(20,160,95,0.3)"}`,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.opacity = "0.8";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.opacity = "1";
                      }}
                    >
                      {user.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                    style={{ background: "var(--ink)" }}
                  >
                    <svg className="w-6 h-6 text-ghostline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-stale">No users found</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}