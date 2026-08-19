export type ConnectionActionState = {
    status: "idle" | "error" | "success";
    message?: string;
    fieldErrors?: Partial<
        Record<
            | "baseUrl"
            | "apiKey"
            | "model"
            | "usenetHost"
            | "usenetPort"
            | "usenetConnections"
            | "usenetUsername"
            | "usenetPassword"
            | "traktClientId"
            | "traktAccessToken"
            | "cookiesFile",
            string
        >
    >;
};

export const initialConnectionActionState: ConnectionActionState = {
    status: "idle",
};
