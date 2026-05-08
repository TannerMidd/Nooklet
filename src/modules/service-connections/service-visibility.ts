import { type ServiceConnectionType } from "@/lib/database/schema";

export function isVisibleServiceConnectionType(serviceType: ServiceConnectionType) {
  return serviceType !== "sonarr" && serviceType !== "radarr";
}
