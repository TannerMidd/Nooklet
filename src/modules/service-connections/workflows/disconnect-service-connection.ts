import { createAuditEvent } from "@/modules/users/repositories/user-repository";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import {
  deleteServiceConnection,
} from "@/modules/service-connections/repositories/service-connection-repository";
import { type ServiceConnectionTypeInput } from "@/modules/service-connections/schemas/service-connection";

export async function disconnectServiceConnection(
  userId: string,
  serviceType: ServiceConnectionTypeInput,
) {
  const deleted = await deleteServiceConnection(userId, serviceType);

  if (deleted) {
    await createAuditEvent({
      actorUserId: userId,
      eventType: "service-connections.disconnected",
      subjectType: "service-connection",
      subjectId: serviceType,
      payloadJson: JSON.stringify({ serviceType }),
    });
  }

  return {
    ok: deleted,
    message: deleted
      ? `${getServiceConnectionDefinition(serviceType).displayName} disconnected.`
      : "Nothing to disconnect.",
  };
}
