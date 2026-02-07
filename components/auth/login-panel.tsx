"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginPanel() {
  const supabase = createBrowserSupabaseClient();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleGoogle = async () => {
    setStatus("sending");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
    }
  };

  const handleEmail = async () => {
    if (!email) return;
    setStatus("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("sent");
    setMessage("Check your email for the magic link.");
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>WDB Deliberations</CardTitle>
        <CardDescription>
          Sign in to access live voting, facilitator controls, and dashboards.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button className="w-full" onClick={handleGoogle} disabled={status === "sending"}>
          Continue with Google
        </Button>
        <div className="rounded-md border bg-muted p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Or use email
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <Input
              type="email"
              placeholder="name@berkeley.edu"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button
              variant="secondary"
              onClick={handleEmail}
              disabled={status === "sending" || !email}
            >
              Send link
            </Button>
          </div>
        </div>
        {message ? (
          <p className={status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
