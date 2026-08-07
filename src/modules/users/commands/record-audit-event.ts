import { z } from "zod";

import { createAuditEvent } from "@/modules/users/repositories/user-repository";

export const recordAuditEventInputSchema = z.object({
    actorUserId: z.string().min(1).nullable().optional(),
    eventType: z.string().min(1),
    subjectType: z.string().min(1),
    subjectId: z.string().min(1).nullable().optional(),
    payload: z.unknown().optional(),
});

export type RecordAuditEventInput = z.infer<typeof recordAuditEventInputSchema>;

export async function recordAuditEvent(input: RecordAuditEventInput) {
    const parsed = recordAuditEventInputSchema.parse(input);

    await createAuditEvent(parsed);
}
