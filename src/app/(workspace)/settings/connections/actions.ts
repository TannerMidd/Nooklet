"use server";

import { revalidatePath } from "next/cache";

import { type ConnectionActionState } from "@/app/(workspace)/settings/connections/action-state";
import { prepareConnectionFormValues } from "@/app/(workspace)/settings/connections/connection-form-values";
import { getProtectedActionSession as auth } from "@/modules/identity-access/workflows/get-protected-action-session";
import { consumeRateLimit, formatRetryAfter } from "@/lib/security/rate-limit";
import {
    apiKeyServiceConnectionSchema,
    aiProviderConnectionSchema,
    serviceConnectionIntentSchema,
    serviceConnectionTypeSchema,
    type ServiceConnectionTypeInput,
} from "@/modules/service-connections/schemas/service-connection";
import { disconnectServiceConnection } from "@/modules/service-connections/workflows/disconnect-service-connection";
import { saveConfiguredServiceConnection } from "@/modules/service-connections/workflows/save-service-connection";
import { testAndSaveServiceConnection } from "@/modules/service-connections/workflows/test-and-save-service-connection";
import { verifyConfiguredServiceConnection } from "@/modules/service-connections/workflows/verify-configured-service-connection";

function credentialFieldForService(serviceType: ServiceConnectionTypeInput) {
    return serviceType === "usenet-server"
        ? "usenetPassword"
        : serviceType === "trakt"
          ? "traktAccessToken"
          : "apiKey";
}

function renderedFieldForService(
    serviceType: ServiceConnectionTypeInput,
    field: "apiKey" | "baseUrl",
) {
    return field === "baseUrl"
        ? serviceType === "usenet-server"
            ? "usenetHost"
            : "baseUrl"
        : credentialFieldForService(serviceType);
}

export async function submitConnectionAction(
    _previousState: ConnectionActionState,
    formData: FormData,
): Promise<ConnectionActionState> {
    const session = await auth();

    if (!session?.user?.id) {
        return {
            status: "error",
            message: "You need to sign in again.",
        };
    }

    const serviceType = serviceConnectionTypeSchema.parse(formData.get("serviceType"));

    if (session.user.role !== "admin" && serviceType !== "trakt") {
        return {
            status: "error",
            message: "Only an administrator can change or verify shared server connections.",
        };
    }

    const intent = serviceConnectionIntentSchema.parse(formData.get("intent"));

    if (intent === "disconnect") {
        const result = await disconnectServiceConnection(session.user.id, serviceType);

        revalidatePath("/settings/connections");

        return {
            status: result.ok ? "success" : "error",
            message: result.message,
        };
    }

    if (intent === "verify") {
        const rateLimit = consumeRateLimit({
            key: `verify-connection:${session.user.id}:${serviceType}`,
            limit: 10,
            windowMs: 5 * 60 * 1000,
        });

        if (!rateLimit.ok) {
            return {
                status: "error",
                message: `Too many verification attempts. Try again in ${formatRetryAfter(rateLimit.retryAfterMs)}.`,
            };
        }

        const result = await verifyConfiguredServiceConnection(session.user.id, serviceType);

        revalidatePath("/settings/connections");

        return {
            status: result.ok ? "success" : "error",
            message: result.message,
            fieldErrors:
                !result.ok && result.field
                    ? {
                          [renderedFieldForService(serviceType, result.field)]: result.message,
                      }
                    : undefined,
        };
    }

    const preparedValues = prepareConnectionFormValues(serviceType, formData);

    if (!preparedValues.success) {
        return {
            status: "error",
            message: "Review the highlighted fields and try again.",
            fieldErrors: preparedValues.fieldErrors,
        };
    }

    if (serviceType === "ai-provider") {
        const parsedInput = aiProviderConnectionSchema.safeParse({
            serviceType,
            baseUrl: preparedValues.baseUrl,
            apiKey: preparedValues.apiKey,
            model: formData.get("model"),
        });

        if (!parsedInput.success) {
            const flattenedErrors = parsedInput.error.flatten().fieldErrors;

            return {
                status: "error",
                message: "Review the highlighted fields and try again.",
                fieldErrors: {
                    baseUrl: flattenedErrors.baseUrl?.[0],
                    apiKey: flattenedErrors.apiKey?.[0],
                    model: flattenedErrors.model?.[0],
                },
            };
        }

        if (intent === "test-save") {
            const rateLimit = consumeRateLimit({
                key: `verify-connection:${session.user.id}:${serviceType}`,
                limit: 10,
                windowMs: 5 * 60 * 1000,
            });

            if (!rateLimit.ok) {
                return {
                    status: "error",
                    message: `Too many connection tests. Try again in ${formatRetryAfter(rateLimit.retryAfterMs)}.`,
                };
            }
        }

        const result =
            intent === "test-save"
                ? await testAndSaveServiceConnection(session.user.id, parsedInput.data)
                : await saveConfiguredServiceConnection(session.user.id, parsedInput.data);

        revalidatePath("/settings/connections");

        return {
            status: result.ok ? "success" : "error",
            message: result.message,
            fieldErrors:
                !result.ok && result.field
                    ? {
                          [result.field]: result.message,
                      }
                    : undefined,
        };
    }

    const parsedInput = apiKeyServiceConnectionSchema.safeParse({
        serviceType,
        baseUrl: preparedValues.baseUrl,
        apiKey: preparedValues.apiKey,
    });

    if (!parsedInput.success) {
        const flattenedErrors = parsedInput.error.flatten().fieldErrors;

        return {
            status: "error",
            message: "Review the highlighted fields and try again.",
            fieldErrors: {
                baseUrl: flattenedErrors.baseUrl?.[0],
                apiKey: flattenedErrors.apiKey?.[0],
            },
        };
    }

    if (intent === "test-save") {
        const rateLimit = consumeRateLimit({
            key: `verify-connection:${session.user.id}:${serviceType}`,
            limit: 10,
            windowMs: 5 * 60 * 1000,
        });

        if (!rateLimit.ok) {
            return {
                status: "error",
                message: `Too many connection tests. Try again in ${formatRetryAfter(rateLimit.retryAfterMs)}.`,
            };
        }
    }

    const result =
        intent === "test-save"
            ? await testAndSaveServiceConnection(session.user.id, parsedInput.data)
            : await saveConfiguredServiceConnection(session.user.id, parsedInput.data);

    revalidatePath("/settings/connections");

    return {
        status: result.ok ? "success" : "error",
        message: result.message,
        fieldErrors:
            !result.ok && result.field
                ? { [renderedFieldForService(serviceType, result.field)]: result.message }
                : undefined,
    };
}
