"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/Button";
import { Alert, Field, TextInput } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { focusFirstError } from "@/lib/forms";
import { forgotSchema, type ForgotValues } from "@/lib/validation";

export default function ForgotPasswordPage() {
  const [answer, setAnswer] = useState<{ message: string; reset_path?: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  async function submit(values: ForgotValues) {
    setFailure(null);
    try {
      setAnswer(await api.forgotPassword(values.email));
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "The request could not be sent");
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email address on your staff account to request a reset link."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/auth/login" className="font-medium text-deep-green hover:underline">
            Go back to sign in
          </Link>
          .
        </>
      }
    >
      {answer ? (
        <div className="space-y-5">
          <div className="myturn-auth-outcome" role="status">
            <CheckCircle2 size={30} aria-hidden="true" />
            <h2>Request received</h2>
            <p>If this address belongs to an active account, a one-use reset link can be issued. The prototype does not send email; ask your administrator if no link is available below.</p>
          </div>

          {answer.reset_path && (
            <div className="myturn-auth-development-link">
              <p className="flex items-center gap-2 font-semibold"><KeyRound size={17} aria-hidden="true" /> Development reset link</p>
              <p className="mt-2 text-sm leading-relaxed">
                This link is shown only in development mode. It works once and expires shortly.
              </p>
              <Link
                href={answer.reset_path}
                className="mt-3 inline-block rounded-full bg-deep-green px-4 py-2.5 text-sm font-semibold text-white hover:bg-medium-green"
              >
                Open the reset link
              </Link>
            </div>
          )}
          <Button variant="link" onClick={() => { setAnswer(null); setFailure(null); }}>Use a different email address</Button>
        </div>
      ) : (
        <form noValidate onSubmit={form.handleSubmit(submit, focusFirstError)} className="myturn-auth-form" aria-busy={form.formState.isSubmitting}>
          <Field label="Email address" id="email" error={form.formState.errors.email?.message}>
            <TextInput
              id="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
              error={Boolean(form.formState.errors.email)}
              {...form.register("email")}
            />
          </Field>

          {failure && <Alert tone="error" focus>{failure}</Alert>}

          <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <LoaderCircle size={18} className="motion-safe:animate-spin" aria-hidden="true" />}
            {form.formState.isSubmitting ? "Requesting…" : "Request reset link"}
          </Button>

          <p className="text-xs leading-relaxed text-deep-green">
            This prototype has no email delivery. In development mode, an available reset link appears here. Otherwise, contact your administrator.
          </p>
        </form>
      )}
    </AuthShell>
  );
}
