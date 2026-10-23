import { z } from "zod";

/**
 * The rules the forms apply before anything is sent.
 *
 * The server checks the same things again, because a browser can be told to
 * skip its own checks. These only exist so a mistake is pointed out where it
 * was made, rather than after a round trip.
 */
export const emailField = z
  .string()
  .trim()
  .min(1, "Enter your email address")
  .email("That does not look like an email address");

export const passwordField = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(200, "That password is too long");

export const nameField = z
  .string()
  .trim()
  .min(2, "Enter your full name")
  .max(80, "That name is too long");

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password"),
});

export const registerSchema = z
  .object({
    full_name: nameField,
    password: passwordField,
    confirm_password: z.string(),
  })
  .refine((values) => values.password === values.confirm_password, {
    message: "The two passwords are not the same",
    path: ["confirm_password"],
  });

export const forgotSchema = z.object({ email: emailField });

export const resetSchema = z
  .object({
    password: passwordField,
    confirm_password: z.string(),
  })
  .refine((values) => values.password === values.confirm_password, {
    message: "The two passwords are not the same",
    path: ["confirm_password"],
  });

export const inviteSchema = z.object({ email: emailField });

/** The shared classroom password: a name for the shift tally and the password. */
export const sharedPasswordSchema = z.object({
  name: z.string().trim().max(40, "Use 40 characters or fewer"),
  password: z.string().min(1, "Enter the classroom password"),
});

export const deskSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give the desk a name")
    .max(60, "Use 60 characters or fewer"),
  description: z
    .string()
    .trim()
    .min(1, "Tell the visitor what this desk handles")
    .max(160, "Use 160 characters or fewer"),
  target_minutes: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" ||
        (!Number.isNaN(Number(value)) && Number(value) >= 0.5 && Number(value) <= 240),
      "Use between 0.5 and 240 minutes, or leave it blank",
    ),
});

/** A board's name. The counter is chosen from a list, not typed. */
export const boardSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, "Give the board a name")
    .max(60, "Use 60 characters or fewer"),
});

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Enter your current password"),
    password: passwordField,
    confirm_password: z.string(),
  })
  .refine((values) => values.password === values.confirm_password, {
    message: "The two passwords are not the same",
    path: ["confirm_password"],
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ForgotValues = z.infer<typeof forgotSchema>;
export type ResetValues = z.infer<typeof resetSchema>;
export type InviteValues = z.infer<typeof inviteSchema>;
export type SharedPasswordValues = z.infer<typeof sharedPasswordSchema>;
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
export type DeskSettingsValues = z.infer<typeof deskSettingsSchema>;
export type BoardValues = z.infer<typeof boardSchema>;
