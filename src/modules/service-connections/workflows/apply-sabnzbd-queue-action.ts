import {
  listSabnzbdQueue,
  moveSabnzbdQueueItemToPosition,
  pauseSabnzbdQueueItem,
  removeSabnzbdQueueItem,
  resumeSabnzbdQueueItem,
} from "@/lib/integrations/sabnzbd";
import { decryptSecret } from "@/lib/security/secret-box";
import {
  formatSabnzbdQueueActionMessage,
  sabnzbdQueuePageLimit,
  type SabnzbdQueueActionInput,
} from "@/modules/service-connections/sabnzbd-queue-actions";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";

import { type ActiveSabnzbdQueueState } from "./get-active-sabnzbd-queue";

async function getVerifiedSabnzbdContext(userId: string) {
  const connection = await findServiceConnectionByType(userId, "sabnzbd");

  if (!connection?.secret || !connection.connection.baseUrl) {
    throw new Error("Connect SABnzbd before editing the queue.");
  }

  if (connection.connection.status !== "verified") {
    throw new Error(connection.connection.statusMessage ?? "Verify SABnzbd before editing the queue.");
  }

  return {
    baseUrl: connection.connection.baseUrl,
    apiKey: decryptSecret(connection.secret.encryptedValue),
  };
}

function getQueueItemIndexOrThrow(input: {
  itemId: string;
  items: Array<{ id: string }>;
}) {
  const currentIndex = input.items.findIndex((item) => item.id === input.itemId);

  if (currentIndex === -1) {
    throw new Error("That SABnzbd queue item is no longer available.");
  }

  return currentIndex;
}

function getQueueMoveTargetPosition(input: {
  itemId: string;
  direction: "up" | "down";
  items: Array<{ id: string }>;
  totalQueueCount: number;
}) {
  const currentIndex = getQueueItemIndexOrThrow({
    itemId: input.itemId,
    items: input.items,
  });

  if (input.direction === "up") {
    if (currentIndex === 0) {
      throw new Error("That SABnzbd queue item is already at the top.");
    }

    return currentIndex - 1;
  }

  if (currentIndex >= input.totalQueueCount - 1) {
    throw new Error("That SABnzbd queue item is already at the bottom.");
  }

  return currentIndex + 1;
}

function getQueueDirectTargetPosition(input: {
  itemId: string;
  targetIndex: number;
  items: Array<{ id: string }>;
  totalQueueCount: number;
}) {
  const currentIndex = getQueueItemIndexOrThrow({
    itemId: input.itemId,
    items: input.items,
  });

  if (input.targetIndex >= input.totalQueueCount) {
    throw new Error("That SABnzbd queue position is no longer available.");
  }

  if (currentIndex === input.targetIndex) {
    return null;
  }

  return input.targetIndex;
}

export async function applySabnzbdQueueAction(
  userId: string,
  action: SabnzbdQueueActionInput,
): Promise<ActiveSabnzbdQueueState> {
  const context = await getVerifiedSabnzbdContext(userId);

  if (action.type === "move" || action.type === "moveToIndex") {
    const snapshot = await listSabnzbdQueue({
      baseUrl: context.baseUrl,
      apiKey: context.apiKey,
      limit: sabnzbdQueuePageLimit,
    });

    const position =
      action.type === "move"
        ? getQueueMoveTargetPosition({
            itemId: action.itemId,
            direction: action.direction,
            items: snapshot.items,
            totalQueueCount: snapshot.totalQueueCount,
          })
        : getQueueDirectTargetPosition({
            itemId: action.itemId,
            targetIndex: action.targetIndex,
            items: snapshot.items,
            totalQueueCount: snapshot.totalQueueCount,
          });

    if (position === null) {
      return {
        connectionStatus: "verified",
        statusMessage: "Queue order unchanged.",
        snapshot,
      };
    }

    await moveSabnzbdQueueItemToPosition({
      baseUrl: context.baseUrl,
      apiKey: context.apiKey,
      itemId: action.itemId,
      position,
    });
  } else if (action.type === "pause") {
    await pauseSabnzbdQueueItem({
      baseUrl: context.baseUrl,
      apiKey: context.apiKey,
      itemId: action.itemId,
    });
  } else if (action.type === "resume") {
    await resumeSabnzbdQueueItem({
      baseUrl: context.baseUrl,
      apiKey: context.apiKey,
      itemId: action.itemId,
    });
  } else {
    await removeSabnzbdQueueItem({
      baseUrl: context.baseUrl,
      apiKey: context.apiKey,
      itemId: action.itemId,
    });
  }

  const snapshot = await listSabnzbdQueue({
    baseUrl: context.baseUrl,
    apiKey: context.apiKey,
    limit: sabnzbdQueuePageLimit,
  });

  return {
    connectionStatus: "verified",
    statusMessage: formatSabnzbdQueueActionMessage(action),
    snapshot,
  };
}