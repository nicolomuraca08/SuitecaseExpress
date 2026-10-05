import { describe, expect, it } from "vitest";

describe("reCAPTCHA secret configuration", () => {
  it("is accepted by Google siteverify", async () => {
    const secret = process.env.RECAPTCHA_SECRET_KEY ?? "";
    expect(secret).toBeTruthy();

    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: "test-token" }),
    });
    expect(response.ok).toBe(true);

    const result = await response.json() as { success?: boolean; [key: string]: unknown };
    const errorCodes = Array.isArray(result["error-codes"]) ? result["error-codes"] as string[] : [];
    expect(errorCodes).not.toContain("invalid-input-secret");
  }, 15_000);
});
