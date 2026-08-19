import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") redirect("/dashboard");

  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} userName={user.name} />
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
