import { z } from "zod";

const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128)
  .regex(/[a-z]/, "Include a lowercase letter.")
  .regex(/[A-Z]/, "Include an uppercase letter.")
  .regex(/[0-9]/, "Include a number.");

export const createManagedUserInputSchema = z
  .object({
    displayName: z.string().trim().min(2, "Enter a display name.").max(80),
    email: z.string().trim().email("Enter a valid email address.").max(320),
    role: z.enum(["admin", "user"]),
    password: passwordSchema,
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

export const updateManagedUserRoleInputSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "user"]),
});

export const updateManagedUserStatusInputSchema = z.object({
  userId: z.string().uuid(),
  isDisabled: z.boolean(),
});

export const resetManagedUserPasswordInputSchema = z
  .object({
    userId: z.string().uuid(),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm the password."),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export type CreateManagedUserInput = z.infer<typeof createManagedUserInputSchema>;
export type UpdateManagedUserRoleInput = z.infer<typeof updateManagedUserRoleInputSchema>;
export type UpdateManagedUserStatusInput = z.infer<typeof updateManagedUserStatusInputSchema>;
export type ResetManagedUserPasswordInput = z.infer<typeof resetManagedUserPasswordInputSchema>;
