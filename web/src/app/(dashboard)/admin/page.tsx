import { query } from "@/lib/db";

export default async function AdminOverview() {
  let stats = { users: "0", matches: "0", predictions: "0", configs: "0" };
  try {
    const [users, matches, predictions, configs] = await Promise.all([
      query<{ count: string }>("SELECT COUNT(*) as count FROM users"),
      query<{ count: string }>("SELECT COUNT(*) as count FROM matches"),
      query<{ count: string }>("SELECT COUNT(*) as count FROM predictions"),
      query<{ count: string }>("SELECT COUNT(*) as count FROM system_config"),
    ]);
    stats = {
      users: users[0]?.count || "0",
      matches: matches[0]?.count || "0",
      predictions: predictions[0]?.count || "0",
      configs: configs[0]?.count || "0",
    };
  } catch {
    // DB may not be connected yet
  }

  const cards = [
    { label: "Total Users", value: stats.users, color: "text-[#3b82f6]" },
    { label: "Matches", value: stats.matches, color: "text-[#22c55e]" },
    { label: "Predictions", value: stats.predictions, color: "text-[#f59e0b]" },
    { label: "Config Entries", value: stats.configs, color: "text-[#a855f7]" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin Overview</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
            <p className="text-sm text-[#71717a]">{card.label}</p>
            <p className={`text-3xl font-bold mt-2 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/admin/config"
            className="block p-4 rounded-lg border border-[#27272a] hover:border-[#22c55e] transition-colors"
          >
            <h3 className="font-medium">System Config</h3>
            <p className="text-sm text-[#71717a] mt-1">Manage API keys, model settings, and system parameters</p>
          </a>
          <a
            href="/admin/users"
            className="block p-4 rounded-lg border border-[#27272a] hover:border-[#22c55e] transition-colors"
          >
            <h3 className="font-medium">User Management</h3>
            <p className="text-sm text-[#71717a] mt-1">View, promote, or deactivate user accounts</p>
          </a>
          <a
            href="/admin/pipeline"
            className="block p-4 rounded-lg border border-[#27272a] hover:border-[#22c55e] transition-colors"
          >
            <h3 className="font-medium">Pipeline Control</h3>
            <p className="text-sm text-[#71717a] mt-1">View pipeline status and configuration</p>
          </a>
        </div>
      </div>
    </div>
  );
}
