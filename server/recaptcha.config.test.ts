import { describe, expect, it } from "vitest";

describe("reCAPTCHA configuration", () => {
  it("exposes a valid public site key format when configured", () => {
    const siteKey = process.env.VITE_RECAPTCHA_SITE_KEY ?? "";
    expect(siteKey).toMatch(/^6Lc[A-Za-z0-9_-]{30,}$/);
  });
});
