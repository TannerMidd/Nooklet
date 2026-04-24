import { z } from "zod";

export const loginInputSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(320),
  password: z.string().min(1, "Enter your password."),
});

export type LoginInput = z.infer<typeof loginInputSchema>;
