import { z } from "zod";

export const bootstrapInputSchema = z
  .object({
    displayName: z.string().trim().min(2, "Enter a display name.").max(80),
    email: z.string().trim().email("Enter a valid email address.").max(320),
    password: z
      .string()
      .min(12, "Use at least 12 characters.")
      .max(128)
      .regex(/[a-z]/, "Include a lowercase letter.")
      .regex(/[A-Z]/, "Include an uppercase letter.")
      .regex(/[0-9]/, "Include a number."),
    confirmPassword: z.string().min(1, "Confirm the password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  })
  .transform((value) => ({
    ...value,
    email: value.email.trim().toLowerCase(),
  }));

export type BootstrapInput = z.infer<typeof bootstrapInputSchema>;
