"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginPanel() {
  const supabase = createBrowserSupabaseClient();
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

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>WDB Deliberations</CardTitle>
        <CardDescription>
          Sign in to access live voting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button className="w-full" onClick={handleGoogle} disabled={status === "sending"}>
          Continue with Google
        </Button>
        {message ? (
          <p className={status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
