import { describe, it, expect, vi } from "vitest";
import {
  fetchWithCanonicalRedirects,
  getCanonicalRedirectTarget,
  normalizePathname,
} from "../../src/runtime/server/api/auth/redirect-utils";

describe("auth proxy canonical redirect handling", () => {
  describe("normalizePathname", () => {
    it("removes trailing slashes while preserving root", () => {
      expect(normalizePathname("/api/auth/sign-up/email/")).toBe(
        "/api/auth/sign-up/email",
      );
      expect(normalizePathname("/")).toBe("/");
    });
  });

  describe("getCanonicalRedirectTarget", () => {
    it("returns redirect target for cross-origin canonical redirect", () => {
      const target = getCanonicalRedirectTarget(
        "https://my-domain.com/api/auth/sign-up/email?foo=bar",
        "https://www.my-domain.com/api/auth/sign-up/email?foo=bar",
      );
      expect(target).toBe(
        "https://www.my-domain.com/api/auth/sign-up/email?foo=bar",
      );
    });

    it("returns null for different path redirects", () => {
      const target = getCanonicalRedirectTarget(
        "https://my-domain.com/api/auth/sign-up/email",
        "https://www.my-domain.com/oauth/authorize",
      );
      expect(target).toBeNull();
    });
  });

  describe("fetchWithCanonicalRedirects", () => {
    it("follows canonical cross-origin redirects internally", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response("", {
            status: 307,
            headers: {
              location:
                "https://www.my-domain.com/api/auth/sign-up/email?foo=bar",
            },
          }),
        )
        .mockResolvedValueOnce(new Response("ok", { status: 200 }));

      const response = await fetchWithCanonicalRedirects({
        target: "https://my-domain.com/api/auth/sign-up/email?foo=bar",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"email":"test@example.com"}',
        fetchImpl: fetchMock,
      });

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://my-domain.com/api/auth/sign-up/email?foo=bar",
      );
      expect(fetchMock.mock.calls[1][0]).toBe(
        "https://www.my-domain.com/api/auth/sign-up/email?foo=bar",
      );
    });

    it("does not follow non-canonical redirects (oauth style)", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        new Response("", {
          status: 302,
          headers: {
            location:
              "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc",
          },
        }),
      );

      const response = await fetchWithCanonicalRedirects({
        target: "https://www.my-domain.com/api/auth/sign-in/social",
        method: "GET",
        headers: {},
        fetchImpl: fetchMock,
      });

      expect(response.status).toBe(302);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("stops after max canonical redirects", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response("", {
            status: 307,
            headers: {
              location: "https://www.my-domain.com/api/auth/sign-up/email",
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response("", {
            status: 307,
            headers: {
              location: "https://auth.my-domain.com/api/auth/sign-up/email",
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response("", {
            status: 307,
            headers: {
              location: "https://next.my-domain.com/api/auth/sign-up/email",
            },
          }),
        );

      const response = await fetchWithCanonicalRedirects({
        target: "https://my-domain.com/api/auth/sign-up/email",
        method: "POST",
        headers: {},
        maxRedirects: 2,
        fetchImpl: fetchMock,
      });

      expect(response.status).toBe(307);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });
});
