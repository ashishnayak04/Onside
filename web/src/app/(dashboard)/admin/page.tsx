import { query } from "@/lib/db";
import Link from "next/link";

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
  } catch (e) {
    console.error("Admin stats query failed:", e);
  }

  const cards = [
    {
      label: "Total Users",
      value: stats.users,
      color: "#7AA7FF",
      bg: "rgba(122,167,255,0.16)",
      accent: "stat-accent-blue",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      label: "Matches",
      value: stats.matches,
      color: "#14A05F",
      bg: "rgba(20,160,95,0.14)",
      accent: "stat-accent-leaf",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      label: "Predictions",
      value: stats.predictions,
      color: "#F2B01C",
      bg: "rgba(242,176,28,0.14)",
      accent: "stat-accent-ember",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      label: "Config Entries",
      value: stats.configs,
      color: "#f5b800",
      bg: "rgba(245,184,0,0.14)",
      accent: "stat-accent-amber",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  const quickActions = [
    {
      href: "/admin/config",
      title: "System Config",
      desc: "Manage API keys, model settings, and system parameters",
      color: "#C98900",
      bg: "rgba(242,176,28,0.14)",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      href: "/admin/users",
      title: "User Management",
      desc: "View, promote, or deactivate user accounts",
      color: "#7AA7FF",
      bg: "rgba(122,167,255,0.16)",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      href: "/admin/pipeline",
      title: "Pipeline Control",
      desc: "View pipeline status and configuration",
      color: "#14A05F",
      bg: "rgba(20,160,95,0.14)",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
    },
  ];

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="page-header mb-1">
          Admin Overview<span className="text-ember">.</span>
        </h1>
        <p className="text-sm text-stale">
          Platform health and quick actions at a glance
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className={`dash-card rounded-2xl p-5 ${card.accent}`}>
            <div className="flex items-center justify-between mb-3">
              <p
                className="text-xs font-semibold uppercase tracking-wider text-stale"
                style={{ fontFamily: "var(--font-label)" }}
              >
                {card.label}
              </p>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: card.bg, color: card.color }}
              >
                {card.icon}
              </div>
            </div>
            <p className="text-3xl font-bold text-chalk" style={{ color: card.color }}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="dash-card rounded-2xl p-6">
        <h2
          className="text-base font-semibold mb-1 text-chalk"
          style={{ fontFamily: "var(--font-label)" }}
        >
          Quick Actions
        </h2>
        <p className="text-xs mb-5 text-stale">Jump to any admin section</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group block p-4 rounded-xl dash-card"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                style={{ background: action.bg, color: action.color }}
              >
                {action.icon}
              </div>
              <h3 className="text-sm font-semibold mb-1 text-chalk">{action.title}</h3>
              <p className="text-xs leading-relaxed text-stale">{action.desc}</p>
              <div className="mt-3 flex items-center gap-1 text-xs font-medium" style={{ color: action.color }}>
                Go to {action.title}
                <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}