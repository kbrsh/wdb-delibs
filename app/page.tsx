import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "@/components/auth/sign-out-button";

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("name, app_role")
    .eq("id", user.id)
    .maybeSingle();

  const { data: sessions } = await supabase
    .from("deliberation_sessions")
    .select("id, name, status")
    .order("created_at", { ascending: false });

  if (sessions && sessions.length === 1 && profile?.app_role) {
    const destination =
      profile.app_role === "admin" || profile.app_role === "facilitator"
        ? `/session/${sessions[0].id}/control`
        : `/session/${sessions[0].id}/live`;
    redirect(destination);
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              WDB Deliberations
            </p>
            <h1 className="text-3xl font-semibold text-foreground">
              Welcome{profile?.name ? `, ${profile.name}` : ""}.
            </h1>
            <p className="text-sm text-muted-foreground">
              Select a session to jump into live voting or facilitator controls.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {profile?.app_role ? <Badge>{profile.app_role}</Badge> : null}
            <SignOutButton />
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {(sessions ?? []).map((session) => (
            <Card key={session.id} className="flex flex-col justify-between">
              <CardHeader className="pb-2">
                <CardTitle>{session.name}</CardTitle>
                <CardDescription>Session status: {session.status}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 pt-0">
                <Link
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  href={`/session/${session.id}/live`}
                >
                  Live view
                </Link>
                <Link
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
                  href={`/session/${session.id}/control`}
                >
                  Control
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
