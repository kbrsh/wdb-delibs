import { LoginPanel } from "@/components/auth/login-panel";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <header className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            WDB Deliberations
          </p>
          <h1 className="text-4xl font-semibold text-foreground sm:text-5xl">
            Final deliberations, structured and calm.
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Vote privately, keep the room in sync, and surface the right candidates for the next
            cohort. Airtable stays open in a separate tab.
          </p>
        </header>
        <LoginPanel />
      </div>
    </main>
  );
}
