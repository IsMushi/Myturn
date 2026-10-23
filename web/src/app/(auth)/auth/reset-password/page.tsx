"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/Button";
import { Alert, Field } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { api } from "@/lib/api";
import { focusFirstError } from "@/lib/forms";
import { useQueryParam } from "@/lib/useQueryParam";
import { useMounted } from "@/lib/useTicketToken";
import { resetSchema, type ResetValues } from "@/lib/validation";

export default function ResetPasswordPage() {
  const router = useRouter();
  const token = useQueryParam("token");
  const mounted = useMounted();
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirm_password: "" },
  });

  async function submit(values: ResetValues) {
    if (!token) return;
    setFailure(null);
    try {
      await api.resetPassword({
        token,
        password: values.password,
        confirm_password: values.confirm_password,
      });
      setDone(true);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "The password could not be changed");
    }
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Choose a password you do not use elsewhere. Your reset link can only be used once."
      footer={
        <>
          <Link href="/auth/login" className="font-medium text-deep-green hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {!mounted ? <p role="status" className="text-sm text-deep-green">Checking your reset link…</p> : !token ? (
        <div className="myturn-auth-outcome">
          <KeyRound size={30} aria-hidden="true" />
          <h2>A reset link is needed</h2>
          <p>Open the link from your reset request, or request a new one to continue.</p>
          <Link href="/auth/forgot-password" className="myturn-auth-inline-link">Request a new reset link</Link>
        </div>
      ) : done ? (
        <div className="space-y-4">
          <div className="myturn-auth-outcome" role="status"><CheckCircle2 size={30} aria-hidden="true" /><h2>Password updated</h2><p>Your password has been changed. Sign in with your new password to continue.</p></div>
          <Button size="lg" className="w-full" onClick={() => router.push("/auth/login")}>
            Go to sign in
          </Button>
        </div>
      ) : (
        <form noValidate onSubmit={form.handleSubmit(submit, focusFirstError)} className="myturn-auth-form" aria-busy={form.formState.isSubmitting}>
          <Field
            label="New password"
            id="password"
            hint="At least 8 characters."
            error={form.formState.errors.password?.message}
          >
            <PasswordInput
              id="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              error={Boolean(form.formState.errors.password)}
              {...form.register("password")}
            />
          </Field>

          <Field
            label="Repeat the new password"
            id="confirm_password"
            error={form.formState.errors.confirm_password?.message}
          >
            <PasswordInput
              id="confirm_password"
              visibilityName="confirmation password"
              autoComplete="new-password"
              placeholder="Repeat the new password"
              error={Boolean(form.formState.errors.confirm_password)}
              {...form.register("confirm_password")}
            />
          </Field>

          {failure && <div className="space-y-3"><Alert tone="error" focus>{failure}</Alert><Link href="/auth/forgot-password" className="myturn-auth-inline-link">Request a new reset link</Link></div>}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={form.formState.isSubmitting || !token}
          >
            {form.formState.isSubmitting && <LoaderCircle size={18} className="motion-safe:animate-spin" aria-hidden="true" />}
            {form.formState.isSubmitting ? "Changing…" : "Change my password"}
          </Button>

        </form>
      )}
    </AuthShell>
  );
}
