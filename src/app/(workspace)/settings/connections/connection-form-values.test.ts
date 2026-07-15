import { describe, expect, it } from "vitest";

import {
  getUsenetFormDefaults,
  prepareConnectionFormValues,
} from "./connection-form-values";

describe("prepareConnectionFormValues", () => {
  it("serializes structured Usenet fields to the existing connection contract", () => {
    const form = new FormData();
    form.set("usenetHost", "news.example.test");
    form.set("usenetPort", "563");
    form.set("usenetConnections", "12");
    form.set("usenetTls", "on");
    form.set("usenetUsername", "reader");
    form.set("usenetPassword", "secret");

    expect(prepareConnectionFormValues("usenet-server", form)).toEqual({
      success: true,
      baseUrl: "nntps://news.example.test:563?connections=12",
      apiKey: "reader::secret",
    });
  });

  it("keeps an existing structured credential when both replacement fields are blank", () => {
    const form = new FormData();
    form.set("usenetHost", "news.example.test");
    form.set("usenetPort", "119");
    form.set("usenetConnections", "8");
    form.set("usenetUsername", "");
    form.set("usenetPassword", "");

    expect(prepareConnectionFormValues("usenet-server", form)).toMatchObject({
      success: true,
      baseUrl: "nntp://news.example.test:119?connections=8",
      apiKey: "",
    });
  });

  it("rejects partial Usenet credentials instead of silently replacing the saved pair", () => {
    const form = new FormData();
    form.set("usenetHost", "news.example.test");
    form.set("usenetPort", "563");
    form.set("usenetConnections", "8");
    form.set("usenetUsername", "reader");
    form.set("usenetPassword", "");

    expect(prepareConnectionFormValues("usenet-server", form)).toEqual({
      success: false,
      fieldErrors: {
        usenetPassword: "Enter both the username and password, or leave both blank to keep saved credentials.",
      },
    });
  });

  it("rejects host strings that could change URL authority", () => {
    const form = new FormData();
    form.set("usenetHost", "reader@news.example.test");
    form.set("usenetPort", "563");
    form.set("usenetConnections", "8");
    form.set("usenetUsername", "");
    form.set("usenetPassword", "");

    expect(prepareConnectionFormValues("usenet-server", form)).toEqual({
      success: false,
      fieldErrors: {
        usenetHost: "Enter only a hostname or IP address, without a scheme, port, or path.",
      },
    });
  });

  it("serializes separate Trakt fields without exposing a composite syntax", () => {
    const form = new FormData();
    form.set("baseUrl", "https://api.trakt.tv");
    form.set("traktClientId", "client-id");
    form.set("traktAccessToken", "oauth-token");

    const result = prepareConnectionFormValues("trakt", form);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(JSON.parse(result.apiKey)).toEqual({ clientId: "client-id", accessToken: "oauth-token" });
    }
  });
});

describe("getUsenetFormDefaults", () => {
  it("hydrates structured controls from a saved NNTP URL", () => {
    expect(getUsenetFormDefaults("nntps://news.example.test:563?connections=14")).toEqual({
      host: "news.example.test",
      port: 563,
      tls: true,
      connections: 14,
    });
  });
});
