export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0A1A10 0%, #0D3320 50%, #0A2818 100%)",
      }}
    >
      {/* Decorative pitch grid */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Glowing orbs */}
      <div
        className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, #1B5E37, transparent)" }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full opacity-15 blur-3xl"
        style={{ background: "radial-gradient(circle, #FF4D00, transparent)" }}
      />

      {/* Ghost brand text */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden"
        aria-hidden="true"
      >
        <span
          className="ghost-number-light text-[22rem] font-black"
          style={{ fontFamily: "var(--font-headline)" }}
        >
          OS
        </span>
      </div>

      <div className="relative z-10 w-full max-w-md px-4 py-8">{children}</div>
    </div>
  );
}
