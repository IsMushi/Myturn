"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/Button";
import { Alert, Field, TextInput } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { api } from "@/lib/api";
import { focusFirstError } from "@/lib/forms";
import { useMounted } from "@/lib/useTicketToken";
import { useQueryParam } from "@/lib/useQueryParam";
import { registerSchema, type RegisterValues } from "@/lib/validation";

type Loaded =
  | { state: "ok"; email: string }
  | { state: "used" }
  | { state: "bad"; message: string };

type Invitation = { state: "checking" } | Loaded;

/**
 * The page an invitation link opens.
 *
 * There is no way to create an account from here without a live invitation:
 * the form refuses to submit, and the server refuses the request even if it is
 * sent by hand.
 */
export default function RegisterPage() {
  const router = useRouter();
  const token = useQueryParam("token");
  const mounted = useMounted();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { full_name: "", password: "", confirm_password: "" },
  });

  useEffect(() => {
    if (!token) return;

    let live = true;
    api
      .invitation(token)
      .then((details) => {
        if (!live) return;
        setLoaded(
          details.accepted ? { state: "used" } : { state: "ok", email: details.email },
        );
      })
      .catch((e) => {
        if (!live) return;
        setLoaded({
          state: "bad",
          message: e instanceof Error ? e.message : "That invitation link is not valid.",
        });
      });

    return () => {
      live = false;
    };
  }, [token]);

  // Before the token is known the page is still checking; once it is known to
  // be absent, the visitor is told what is missing.
  const invitation: Invitation = !mounted
    ? { state: "checking" }
    : token
      ? (loaded ?? { state: "checking" })
      : { state: "bad", message: "This page needs a valid invitation link from your administrator." };

  async function submit(values: RegisterValues) {
    if (!token) return;
    setFailure(null);
    try {
      const result = await api.register({
        token,
        full_name: values.full_name,
        password: values.password,
        confirm_password: values.confirm_password,
      });
      router.replace(result.redirect);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "The account could not be created");
    }
  }

  return (
    <AuthShell
      title="Join the team"
      subtitle="Set up your account. You will work the queue from the staff dashboard."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/auth/login" className="font-medium text-deep-green hover:underline">
            Sign in instead
          </Link>
          .
        </>
      }
    >
      {invitation.state === "checking" && (
        <p className="flex items-center gap-2 text-sm text-deep-green" role="status"><LoaderCircle size={17} className="motion-safe:animate-spin" aria-hidden="true" />Checking your invitation…</p>
      )}

      {invitation.state === "used" && (
        <Alert tone="info">
          This invitation has already been used. Sign in with the account it created, or ask an
          administrator for a new invitation.
        </Alert>
      )}

      {invitation.state === "bad" && (
        <div className="space-y-4">
          <Alert tone="error">{invitation.message}</Alert>
          <p className="text-sm text-medium-green">
            An administrator sends invitations from the administration page. Ask the person who
            runs the desk for a fresh link.
          </p>
        </div>
      )}

      {invitation.state === "ok" && (
        <form noValidate onSubmit={form.handleSubmit(submit, focusFirstError)} className="myturn-auth-form" aria-busy={form.formState.isSubmitting}>
          <p className="rounded-xl bg-soft-mint px-3.5 py-3 text-sm text-deep-green">
            This invitation is for <span className="font-semibold">{invitation.email}</span>.
          </p>

          <Field label="Your full name" id="full_name" error={form.formState.errors.full_name?.message}>
            <TextInput
              id="full_name"
              autoComplete="name"
              placeholder="e.g. Leah NIYODUHORANA"
              error={Boolean(form.formState.errors.full_name)}
              {...form.register("full_name")}
            />
          </Field>

          <Field
            label="Password"
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
            label="Repeat the password"
            id="confirm_password"
            error={form.formState.errors.confirm_password?.message}
          >
            <PasswordInput
              id="confirm_password"
              visibilityName="confirmation password"
              autoComplete="new-password"
              placeholder="Repeat the password"
              error={Boolean(form.formState.errors.confirm_password)}
              {...form.register("confirm_password")}
            />
          </Field>

          {failure && <Alert tone="error" focus>{failure}</Alert>}

          <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <LoaderCircle size={18} className="motion-safe:animate-spin" aria-hidden="true" />}
            {form.formState.isSubmitting ? "Creating your account…" : "Create my account"}
          </Button>

          <p className="text-xs text-medium-green">
            Staff accounts work the queue. Administrator rights are granted inside the system,
            never from an invitation link.
          </p>
        </form>
      )}
    </AuthShell>
  );
}
