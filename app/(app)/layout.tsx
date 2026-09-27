import { requireCtx } from "@/lib/auth/context";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  return <AppShell ctx={ctx}>{children}</AppShell>;
}
