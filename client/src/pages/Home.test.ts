import { describe, expect, it } from "vitest";
import { buildPlan } from "./Home";

describe("buildPlan", () => {
  it("genera tutte le categorie richieste e una giornata per ogni data", () => {
    const plan = buildPlan("  Kyoto  ", "2026-04-10", "2026-04-14", "Trolley 10kg", "Da solo/a");

    expect(plan.destination).toBe("Kyoto");
    expect(plan.duration).toBe(5);
    expect(plan.categories.map((category) => category.title)).toEqual([
      "Documenti",
      "Abiti",
      "Elettronica",
      "Beauty",
      "Extra",
    ]);
    expect(plan.itinerary).toHaveLength(5);
    expect(plan.itinerary[0]?.morning).toContain("Kyoto");
    expect(plan.itinerary[4]?.date).toBe("2026-04-14");
    expect(plan.insights.dishes.length).toBe(3);
  });

  it("adatta extra e abiti al profilo del viaggio", () => {
    const plan = buildPlan("Puglia", "2026-07-01", "2026-07-02", "Solo Zaino", "Bambini");
    const clothes = plan.categories.find((category) => category.title === "Abiti")?.items ?? [];
    const extras = plan.categories.find((category) => category.title === "Extra")?.items ?? [];

    expect(clothes).toContain("Sacca organizer comprimibile");
    expect(extras).toContain("Snack e borraccia per bambini");
    expect(plan.itinerary[0]?.evening).toContain("Cena presto");
  });

  it("aggiunge protezioni meteo quando sono previste piogge", () => {
    const plan = buildPlan("Lisbona", "2026-04-10", "2026-04-12", "Trolley 10kg", "Coppia", {
      city: "Lisbona",
      timezone: "Europe/Lisbon",
      rainy: true,
      sunny: false,
      days: [{ date: "2026-04-10", code: 63, min: 12, max: 17, precipitation: 70 }],
    });
    const extras = plan.categories.find((category) => category.title === "Extra")?.items ?? [];
    expect(extras).toContain("Ombrello compatto o poncho impermeabile");
  });
});
