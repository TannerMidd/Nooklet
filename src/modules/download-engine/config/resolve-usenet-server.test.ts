import { describe, expect, it } from "vitest";

import {
  parseUsenetCredentials,
  parseUsenetServerUrl,
  UsenetServerConfigError,
} from "./resolve-usenet-server";

describe("parseUsenetServerUrl", () => {
  it("parses an nntps URL with explicit port and connection pool size", () => {
    expect(parseUsenetServerUrl("nntps://news.example.test:563?connections=12")).toEqual({
      host: "news.example.test",
      port: 563,
      connections: 12,
    });
  });

  it("defaults to port 563 and 8 connections", () => {
    expect(parseUsenetServerUrl("nntps://news.example.test")).toEqual({
      host: "news.example.test",
      port: 563,
      connections: 8,
    });
  });

  it("clamps the connection pool to the supported range", () => {
    expect(parseUsenetServerUrl("nntps://host?connections=99").connections).toBe(20);
    expect(parseUsenetServerUrl("nntps://host?connections=0").connections).toBe(1);
    expect(parseUsenetServerUrl("nntps://host?connections=abc").connections).toBe(8);
  });

  it("rejects plaintext nntp:// with a migration message", () => {
    expect(() => parseUsenetServerUrl("nntp://news.example.test:119")).toThrow(
      /Plaintext nntp:\/\/ is no longer supported/,
    );
  });

  it("rejects non-NNTP protocols", () => {
    for (const url of ["https://news.example.test", "ftp://host", "not a url"]) {
      expect(() => parseUsenetServerUrl(url)).toThrow(UsenetServerConfigError);
    }
  });

  it("rejects embedded credentials and fragments", () => {
    expect(() => parseUsenetServerUrl("nntps://user:pass@host:563")).toThrow(
      /credential field/,
    );
    expect(() => parseUsenetServerUrl("nntps://host:563#fragment")).toThrow(
      UsenetServerConfigError,
    );
  });

  it("rejects out-of-range ports", () => {
    expect(() => parseUsenetServerUrl("nntps://host:0")).toThrow(UsenetServerConfigError);
  });
});

describe("parseUsenetCredentials", () => {
  it("splits on the double-colon separator, allowing colons in passwords", () => {
    expect(parseUsenetCredentials("reader::p:a:ss")).toEqual({
      username: "reader",
      password: "p:a:ss",
    });
  });

  it("falls back to a single-colon split", () => {
    expect(parseUsenetCredentials("reader:secret")).toEqual({
      username: "reader",
      password: "secret",
    });
  });

  it("treats a bare value as a username and blank input as anonymous", () => {
    expect(parseUsenetCredentials("reader")).toEqual({ username: "reader", password: null });
    expect(parseUsenetCredentials("  ")).toEqual({ username: null, password: null });
  });

  it("rejects multi-line credentials that could smuggle NNTP commands", () => {
    expect(() => parseUsenetCredentials("reader::pass\r\nDATE")).toThrow(
      UsenetServerConfigError,
    );
  });
});
