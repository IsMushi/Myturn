"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { api } from "@/lib/api";
import { focusFirstError } from "@/lib/forms";
import { safePath } from "@/lib/format";
import { useQueryParam } from "@/lib/useQueryParam";
import { loginSchema, type LoginValues } from "@/lib/validation";

export default function LoginPage() {
  const router = useRouter();
  const next = useQueryParam("next");

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function submit(values: LoginValues) {
    try {
      const result = await api.login(values.email, values.password);
      // The server decides where an account belongs: the desk for a staff
      // member, the administration page for an administrator.
      router.replace(safePath(next, result.redirect));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign in", {
        id: "login-error",
      });
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back. Sign in to manage your queue and service desk."
      footer={
        <>
          New to the team? Ask your administrator for an invitation link to create your account.
        </>
      }
    >
      <form
        noValidate
        onSubmit={form.handleSubmit(submit, focusFirstError)}
        className="myturn-login-form"
        aria-busy={form.formState.isSubmitting}
      >
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

        <Field label="Password" id="password" error={form.formState.errors.password?.message}>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            error={Boolean(form.formState.errors.password)}
            {...form.register("password")}
          />
        </Field>

        <Link href="/auth/forgot-password" className="myturn-auth-forgot">
          Forgot password?
        </Link>

        <Button type="submit" size="lg" className="myturn-login-submit w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <LoaderCircle size={18} className="motion-safe:animate-spin" aria-hidden="true" />}
          {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>


    </AuthShell>
  );
}
