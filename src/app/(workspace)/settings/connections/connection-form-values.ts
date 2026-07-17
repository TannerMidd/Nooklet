import { z } from "zod";

import { type ServiceConnectionTypeInput } from "@/modules/service-connections/schemas/service-connection";

const usenetFormSchema = z.object({
  usenetHost: z.string().trim().min(1, "Enter the news server host.").max(255),
  usenetPort: z.coerce.number().int().min(1, "Port must be between 1 and 65535.").max(65535, "Port must be between 1 and 65535."),
  usenetConnections: z.coerce.number().int().min(1, "Use at least one connection.").max(20, "Nooklet supports up to 20 connections."),
  usenetUsername: z.string().trim().max(512, "Username must be 512 characters or fewer."),
  usenetPassword: z.string().max(512, "Password must be 512 characters or fewer."),
}).superRefine((value, context) => {
  const dnsOrIpv4Host = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(value.usenetHost);
  const bracketedIpv6Host = /^\[[0-9a-f:]+\]$/i.test(value.usenetHost);
  if (!dnsOrIpv4Host && !bracketedIpv6Host) {
    context.addIssue({
      code: "custom",
      path: ["usenetHost"],
      message: "Enter only a hostname or IP address, without a scheme, port, or path.",
    });
  }

  if ((value.usenetUsername && !value.usenetPassword) || (!value.usenetUsername && value.usenetPassword)) {
    context.addIssue({
      code: "custom",
      path: [value.usenetUsername ? "usenetPassword" : "usenetUsername"],
      message: "Enter both the username and password, or leave both blank to keep saved credentials.",
    });
  }
});

const traktFormSchema = z.object({
  baseUrl: z.string().trim().max(2048).url("Enter a valid base URL."),
  traktClientId: z.string().trim().max(512, "Client ID must be 512 characters or fewer."),
  traktAccessToken: z.string().trim().max(512, "OAuth token must be 512 characters or fewer."),
}).superRefine((value, context) => {
  if ((value.traktClientId && !value.traktAccessToken) || (!value.traktClientId && value.traktAccessToken)) {
    context.addIssue({
      code: "custom",
      path: [value.traktClientId ? "traktAccessToken" : "traktClientId"],
      message: "Enter both the client ID and OAuth token, or leave both blank to keep saved credentials.",
    });
  }
});

export type StructuredConnectionField =
  | "usenetHost"
  | "usenetPort"
  | "usenetConnections"
  | "usenetUsername"
  | "usenetPassword"
  | "traktClientId"
  | "traktAccessToken";

export type PreparedConnectionValues =
  | { success: true; baseUrl: FormDataEntryValue | null; apiKey: string }
  | { success: false; fieldErrors: Partial<Record<StructuredConnectionField, string>> };

function firstFieldErrors(
  issues: z.core.$ZodIssue[],
): Partial<Record<StructuredConnectionField, string>> {
  const errors: Partial<Record<StructuredConnectionField, string>> = {};

  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in errors)) {
      errors[field as StructuredConnectionField] = issue.message;
    }
  }

  return errors;
}

export function prepareConnectionFormValues(
  serviceType: ServiceConnectionTypeInput,
  formData: FormData,
): PreparedConnectionValues {
  if (serviceType === "usenet-server") {
    const parsed = usenetFormSchema.safeParse({
      usenetHost: formData.get("usenetHost"),
      usenetPort: formData.get("usenetPort"),
      usenetConnections: formData.get("usenetConnections"),
      usenetUsername: formData.get("usenetUsername")?.toString() ?? "",
      usenetPassword: formData.get("usenetPassword")?.toString() ?? "",
    });

    if (!parsed.success) {
      return { success: false, fieldErrors: firstFieldErrors(parsed.error.issues) };
    }

    const credentials = parsed.data.usenetUsername && parsed.data.usenetPassword
      ? `${parsed.data.usenetUsername}::${parsed.data.usenetPassword}`
      : "";

    // TLS is not a choice: the engine refuses plaintext NNTP outright.
    return {
      success: true,
      baseUrl: `nntps://${parsed.data.usenetHost}:${parsed.data.usenetPort}?connections=${parsed.data.usenetConnections}`,
      apiKey: credentials,
    };
  }

  if (serviceType === "trakt") {
    const parsed = traktFormSchema.safeParse({
      baseUrl: formData.get("baseUrl"),
      traktClientId: formData.get("traktClientId")?.toString() ?? "",
      traktAccessToken: formData.get("traktAccessToken")?.toString() ?? "",
    });

    if (!parsed.success) {
      return { success: false, fieldErrors: firstFieldErrors(parsed.error.issues) };
    }

    return {
      success: true,
      baseUrl: parsed.data.baseUrl,
      apiKey: parsed.data.traktClientId && parsed.data.traktAccessToken
        ? JSON.stringify({
            clientId: parsed.data.traktClientId,
            accessToken: parsed.data.traktAccessToken,
          })
        : "",
    };
  }

  return {
    success: true,
    baseUrl: formData.get("baseUrl"),
    apiKey: formData.get("apiKey")?.toString() ?? "",
  };
}

export type UsenetFormDefaults = {
  host: string;
  port: number;
  connections: number;
};

export function getUsenetFormDefaults(baseUrl: string): UsenetFormDefaults {
  try {
    const url = new URL(baseUrl);
    const connections = Number.parseInt(url.searchParams.get("connections") ?? "8", 10);
    // Legacy plaintext URLs hydrate to the TLS port: their saved port (119)
    // will not complete a TLS handshake, and saving the form migrates the
    // connection to nntps://.
    const port = url.protocol === "nntps:" && url.port
      ? Number.parseInt(url.port, 10)
      : 563;

    return {
      host: url.hostname || "news.example.com",
      port,
      connections: Number.isInteger(connections) ? Math.min(Math.max(connections, 1), 20) : 8,
    };
  } catch {
    return { host: "news.example.com", port: 563, connections: 8 };
  }
}
