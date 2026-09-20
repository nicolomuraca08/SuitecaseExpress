import { describe, expect, it } from "vitest";
import { PAYMENT_AMOUNT_CENTS } from "./routers";

describe("payment configuration", () => {
  it("uses the requested embedded unlock price of 3.99 EUR", () => {
    expect(PAYMENT_AMOUNT_CENTS).toBe(399);
  });
});
