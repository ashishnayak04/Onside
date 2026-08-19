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

export default function ConfigPage() {
  const [configs, setConfigs] = useState<ConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newConfig, setNewConfig] = useState({ key: "", value: "", category: "general", description: "", is_secret: false });
  const [message, setMessage] = useState("");
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchConfigs();
  }, []);

  async function fetchConfigs() {
    try {
      const res = await fetch("/api/admin/config");
      const data = await res.json();
      setConfigs(data.configs || []);
    } catch {
      setMessage("Failed to load configs");
    } finally {
      setLoading(false);
    }
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
        setMessage(`Updated "${key}" successfully`);
        fetchConfigs();
      } else {
        const data = await res.json();
        setMessage(data.error || "Failed to update");
      }
    } catch {
      setMessage("Network error");
    }
    setTimeout(() => setMessage(""), 3000);
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
        setMessage("Config entry created");
        fetchConfigs();
      } else {
        const data = await res.json();
        setMessage(data.error || "Failed to create");
      }
    } catch {
      setMessage("Network error");
    }
    setTimeout(() => setMessage(""), 3000);
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
        setMessage(`Deleted "${key}"`);
        fetchConfigs();
      }
    } catch {
      setMessage("Network error");
    }
    setTimeout(() => setMessage(""), 3000);
  }

  const categories = [...new Set(configs.map((c) => c.category))];

  if (loading) {
    return <div className="text-[#71717a]">Loading configuration...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">System Configuration</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-[#22c55e] hover:bg-[#16a34a] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Add Config
        </button>
      </div>

      {message && (
        <div className="bg-[#22c55e]/10 border border-[#22c55e]/30 text-[#22c55e] text-sm rounded-lg p-3 mb-4">
          {message}
        </div>
      )}

      {showAdd && (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">New Configuration Entry</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#a1a1aa] mb-1">Key</label>
              <input
                value={newConfig.key}
                onChange={(e) => setNewConfig({ ...newConfig, key: e.target.value })}
                placeholder="e.g. api_football_key"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] mb-1">Category</label>
              <select
                value={newConfig.category}
                onChange={(e) => setNewConfig({ ...newConfig, category: e.target.value })}
                className="w-full"
              >
                <option value="general">General</option>
                <option value="api_keys">API Keys</option>
                <option value="model">Model</option>
                <option value="competitions">Competitions</option>
                <option value="pipeline">Pipeline</option>
                <option value="data">Data</option>
                <option value="system">System</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] mb-1">Value</label>
              <input
                value={newConfig.value}
                onChange={(e) => setNewConfig({ ...newConfig, value: e.target.value })}
                placeholder="Configuration value"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] mb-1">Description</label>
              <input
                value={newConfig.description}
                onChange={(e) => setNewConfig({ ...newConfig, description: e.target.value })}
                placeholder="What this config does"
                className="w-full"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4">
            <label className="flex items-center gap-2 text-sm text-[#a1a1aa]">
              <input
                type="checkbox"
                checked={newConfig.is_secret}
                onChange={(e) => setNewConfig({ ...newConfig, is_secret: e.target.checked })}
                className="rounded"
              />
              Secret (hidden by default)
            </label>
            <div className="flex-1" />
            <button onClick={() => setShowAdd(false)} className="text-sm text-[#71717a] hover:text-white">
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="bg-[#22c55e] hover:bg-[#16a34a] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {categories.map((category) => (
        <div key={category} className="mb-6">
          <h2 className="text-sm font-semibold text-[#71717a] uppercase tracking-wider mb-3">
            {category.replace(/_/g, " ")}
          </h2>
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#27272a]">
                  <th className="text-left text-xs font-medium text-[#71717a] uppercase px-4 py-3">Key</th>
                  <th className="text-left text-xs font-medium text-[#71717a] uppercase px-4 py-3">Value</th>
                  <th className="text-left text-xs font-medium text-[#71717a] uppercase px-4 py-3">Description</th>
                  <th className="text-right text-xs font-medium text-[#71717a] uppercase px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {configs
                  .filter((c) => c.category === category)
                  .map((config) => (
                    <tr key={config.id} className="border-b border-[#27272a] last:border-0">
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-[#22c55e]">{config.key}</span>
                      </td>
                      <td className="px-4 py-3">
                        {editing === config.key ? (
                          <input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full max-w-md text-sm"
                            autoFocus
                          />
                        ) : config.is_secret && !showSecrets[config.key] ? (
                          <span className="text-[#71717a]">••••••••</span>
                        ) : (
                          <span className="text-sm text-[#a1a1aa] font-mono break-all">{config.value}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-[#71717a]">{config.description}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {config.is_secret && (
                            <button
                              onClick={() => setShowSecrets({ ...showSecrets, [config.key]: !showSecrets[config.key] })}
                              className="text-xs text-[#71717a] hover:text-white px-2 py-1"
                            >
                              {showSecrets[config.key] ? "Hide" : "Show"}
                            </button>
                          )}
                          {editing === config.key ? (
                            <>
                              <button
                                onClick={() => handleSave(config.key)}
                                className="text-xs text-[#22c55e] hover:text-[#16a34a] px-2 py-1"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditing(null)}
                                className="text-xs text-[#71717a] hover:text-white px-2 py-1"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditing(config.key);
                                  setEditValue(config.value);
                                }}
                                className="text-xs text-[#3b82f6] hover:text-blue-400 px-2 py-1"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(config.key)}
                                className="text-xs text-[#ef4444] hover:text-red-400 px-2 py-1"
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
      ))}
    </div>
  );
}
