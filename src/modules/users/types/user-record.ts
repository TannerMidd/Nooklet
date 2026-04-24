import { type users } from "@/lib/database/schema";

export type UserRecord = typeof users.$inferSelect;
