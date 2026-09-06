"use client";

import { useEffect, useState } from "react";

interface ConfigEntry {
  id: string;
  key: string;
  value: string;
  category: string;
  description: string | null;
  is_secret: boolean;
  updated_at: string;
}

const CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
  api_keys:     { label: "API Keys",      color: "#C98900", bg: "rgba(242,176,28,0.14)" },
  model:        { label: "Model",         color: "#7AA7FF", bg: "rgba(122,167,255,0.16)" },
  pipeline:     { label: "Pipeline",      color: "#14A05F", bg: "rgba(20,160,95,0.14)"  },
  competitions: { label: "Competitions",  color: "#f5b800", bg: "rgba(245,184,0,0.14)"  },
  general:      { label: "General",       color: "#58645D", bg: "rgba(88,100,93,0.12)"  },
  data:         { label: "Data",          color: "#2B6BE8", bg: "rgba(43,107,232,0.12)"  },
  system:       { label: "System",        color: "#D93B3E", bg: "rgba(217,59,62,0.12)"  },
};

function getMeta(cat: string) {
  return CATEGORY_META[cat] || { label: cat.replace(/_/g, " "), color: "#58645D", bg: "rgba(88,100,93,0.12)" };
}

export default function ConfigPage() {
  const [configs, setConfigs] = useState<ConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newConfig, setNewConfig] = useState({ key: "", value: "", category: "general", description: "", is_secret: false });
  const [message, setMessage] = useState({ text: "", type: "" });
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  useEffect(() => { fetchConfigs(); }, []);

  async function fetchConfigs() {
    try {
      const res = await fetch("/api/admin/config");
      const data = await res.json();
      setConfigs(data.configs || []);
    } catch {
      setMessage({ text: "Failed to load configs", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  function showMsg(text: string, type = "success") {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: "", type: "" }), 3000);
  }

  async function handleSave(key: string) {
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: editValue }),
      });
      if (res.ok) {
        setEditing(null);
        showMsg(`Updated "${key}" successfully`);
        fetchConfigs();
      } else {
        const data = await res.json();
        showMsg(data.error || "Failed to update", "error");
      }
    } catch {
      showMsg("Network error", "error");
    }
  }

  async function handleAdd() {
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      if (res.ok) {
        setShowAdd(false);
        setNewConfig({ key: "", value: "", category: "general", description: "", is_secret: false });
        showMsg("Config entry created");
        fetchConfigs();
      } else {
        const data = await res.json();
        showMsg(data.error || "Failed to create", "error");
      }
    } catch {
      showMsg("Network error", "error");
    }
  }

  async function handleDelete(key: string) {
    if (!confirm(`Delete config "${key}"?`)) return;
    try {
      const res = await fetch("/api/admin/config", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (res.ok) {
        showMsg(`Deleted "${key}"`);
        fetchConfigs();
      }
    } catch {
      showMsg("Network error", "error");
    }
  }

  const categories = [...new Set(configs.map((c) => c.category))];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="flex items-center gap-3">
          <svg className="animate-spin w-5 h-5 text-leaf" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-stale">Loading configuration...</p>
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
            System Config<span className="text-ember">.</span>
          </h1>
          <p className="text-sm text-stale">
            {configs.length} config {configs.length !== 1 ? "entries" : "entry"}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all duration-150"
          style={{
            background: showAdd ? "rgba(242,176,28,0.16)" : "var(--ember)",
            color: showAdd ? "#C98900" : "#221A00",
            border: showAdd ? "1px solid rgba(242,176,28,0.4)" : "1px solid transparent",
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showAdd ? "M6 18L18 6M6 6l12 12" : "M12 4v16m8-8H4"} />
          </svg>
          {showAdd ? "Cancel" : "Add Config"}
        </button>
      </div>

      {/* Message banner */}
      {message.text && (
        <div
          className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm mb-5"
          style={{
            background: message.type === "success" ? "rgba(20,160,95,0.10)" : "rgba(217,59,62,0.10)",
            border: `1px solid ${message.type === "success" ? "rgba(20,160,95,0.3)" : "rgba(217,59,62,0.3)"}`,
            color: message.type === "success" ? "#0B7A45" : "#B3272A",
          }}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {message.type === "success"
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
          </svg>
          {message.text}
        </div>
      )}

      {/* Add new config */}
      {showAdd && (
        <div className="dash-card rounded-2xl p-6 mb-6">
          <h2 className="text-base font-semibold mb-4 text-chalk" style={{ fontFamily: "var(--font-label)" }}>
            New Configuration Entry
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {[
              { label: "Key", field: "key", placeholder: "e.g. api_football_key" },
              { label: "Value", field: "value", placeholder: "Configuration value" },
              { label: "Description", field: "description", placeholder: "What this config does" },
            ].map(({ label, field, placeholder }) => (
              <div key={field} className={field === "description" ? "md:col-span-2" : ""}>
                <label className="block text-[11px] font-bold uppercase tracking-widest mb-2 text-stale" style={{ fontFamily: "var(--font-label)" }}>
                  {label}
                </label>
                <input
                  value={newConfig[field as keyof typeof newConfig] as string}
                  onChange={(e) => setNewConfig({ ...newConfig, [field]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full text-sm rounded-xl px-4 py-2.5"
                />
              </div>
            ))}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest mb-2 text-stale" style={{ fontFamily: "var(--font-label)" }}>
                Category
              </label>
              <select
                value={newConfig.category}
                onChange={(e) => setNewConfig({ ...newConfig, category: e.target.value })}
                className="w-full text-sm rounded-xl px-4 py-2.5"
              >
                {Object.entries(CATEGORY_META).map(([val, { label }]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer text-stale">
              <input
                type="checkbox"
                checked={newConfig.is_secret}
                onChange={(e) => setNewConfig({ ...newConfig, is_secret: e.target.checked })}
                style={{ accentColor: "#14A05F" }}
              />
              Secret (masked by default)
            </label>
            <div className="flex-1" />
            <button
              onClick={handleAdd}
              className="text-sm font-semibold px-4 py-2 rounded-xl transition-all text-[#221A00] bg-ember hover:bg-flame"
            >
              Save Entry
            </button>
          </div>
        </div>
      )}

      {/* Config categories */}
      <div className="space-y-6">
        {categories.map((category) => {
          const meta = getMeta(category);
          return (
            <div key={category}>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg"
                  style={{ color: meta.color, background: meta.bg, fontFamily: "var(--font-label)" }}
                >
                  {meta.label}
                </span>
                <span className="text-xs text-stale">
                  {configs.filter((c) => c.category === category).length} entries
                </span>
              </div>
              <div className="dash-card rounded-2xl overflow-hidden bg-panel">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--ghostline)" }}>
                      {["Key", "Value", "Description", "Actions"].map((h) => (
                        <th
                          key={h}
                          className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider ${h === "Actions" ? "text-right" : "text-left"} text-stale`}
                          style={{ fontFamily: "var(--font-label)", background: "var(--ink)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {configs
                      .filter((c) => c.category === category)
                      .map((config, i, arr) => (
                        <tr
                          key={config.id}
                          style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--ghostline)" : "none" }}
                          className="transition-colors"
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--ink)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                        >
                          {/* Key */}
                          <td className="px-5 py-3.5">
                            <span className="font-mono text-sm" style={{ color: meta.color, fontFamily: "monospace" }}>
                              {config.key}
                            </span>
                            {config.is_secret && (
                              <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(242,176,28,0.14)", color: "#C98900" }}>
                                secret
                              </span>
                            )}
                          </td>

                          {/* Value */}
                          <td className="px-5 py-3.5 max-w-xs">
                            {editing === config.key ? (
                              <input
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                autoFocus
                                className="w-full text-sm rounded-lg px-3 py-1.5"
                                style={{ fontFamily: "monospace" }}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSave(config.key); if (e.key === "Escape") setEditing(null); }}
                              />
                            ) : config.is_secret && !showSecrets[config.key] ? (
                              <span className="text-stale" style={{ fontFamily: "monospace" }}>••••••••</span>
                            ) : (
                              <span className="text-sm break-all text-chalk" style={{ fontFamily: "monospace" }}>
                                {config.value}
                              </span>
                            )}
                          </td>

                          {/* Description */}
                          <td className="px-5 py-3.5">
                            <span className="text-sm text-stale">
                              {config.description || "—"}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-end gap-1.5">
                              {config.is_secret && (
                                <button
                                  onClick={() => setShowSecrets({ ...showSecrets, [config.key]: !showSecrets[config.key] })}
                                  className="text-xs px-2.5 py-1.5 rounded-lg transition-all border border-chalk/10 text-stale hover:text-chalk"
                                  style={{ background: "var(--ink)" }}
                                >
                                  {showSecrets[config.key] ? "Hide" : "Show"}
                                </button>
                              )}
                              {editing === config.key ? (
                                <>
                                  <button
                                    onClick={() => handleSave(config.key)}
                                    className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                                    style={{ color: "#0B7A45", background: "rgba(20,160,95,0.12)", border: "1px solid rgba(20,160,95,0.3)" }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditing(null)}
                                    className="text-xs px-3 py-1.5 rounded-lg border border-chalk/10 text-stale hover:text-chalk"
                                    style={{ background: "var(--ink)" }}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => { setEditing(config.key); setEditValue(config.value); }}
                                    className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                                    style={{ color: "#2B6BE8", background: "rgba(43,107,232,0.12)" }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDelete(config.key)}
                                    className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                                    style={{ color: "#B3272A", background: "rgba(217,59,62,0.10)" }}
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}