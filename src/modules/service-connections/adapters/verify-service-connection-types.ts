import { type ServiceConnectionType } from "@/lib/database/schema";

export type VerifyServiceConnectionInput = {
  serviceType: ServiceConnectionType;
  baseUrl: string;
  secret: string;
  metadata: Record<string, unknown> | null;
};

export type VerifyServiceConnectionResult = {
  ok: boolean;
  message: string;
  metadata?: Record<string, unknown> | null;
};
