import { describe, expect, it } from "vitest";
import { buildPlan } from "./Home";

describe("buildPlan", () => {
  it("genera tutte le categorie richieste e una giornata per ogni giorno", () => {
    const plan = buildPlan("  Kyoto  ", "Aprile", 5, "Trolley 10kg", "Da solo/a");

    expect(plan.destination).toBe("Kyoto");
    expect(plan.categories.map((category) => category.title)).toEqual([
      "Documenti",
      "Abiti",
      "Elettronica",
      "Beauty",
      "Extra",
    ]);
    expect(plan.itinerary).toHaveLength(5);
    expect(plan.itinerary[0]?.morning).toContain("Kyoto");
    expect(plan.itinerary[4]?.day).toBe(5);
  });

  it("adatta extra e abiti al profilo del viaggio", () => {
    const plan = buildPlan("Puglia", "Luglio", 2, "Solo Zaino", "Bambini");
    const clothes = plan.categories.find((category) => category.title === "Abiti")?.items ?? [];
    const extras = plan.categories.find((category) => category.title === "Extra")?.items ?? [];

    expect(clothes).toContain("Sacca organizer comprimibile");
    expect(extras).toContain("Snack e borraccia per bambini");
    expect(plan.itinerary[0]?.evening).toContain("Cena presto");
  });
});
