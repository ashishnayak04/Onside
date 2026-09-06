export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // Login page is now full-screen and manages its own layout
  return <>{children}</>;
}
