import { describe, expect, it } from "vitest";
import {
  rankClientsBySimilarity,
  type SearchableClient,
} from "@/utils/clientSearch";

const clients: SearchableClient[] = [
  {
    id_client: 1,
    first_name: "Ana",
    last_name: "Nuñez",
    email: "ana@example.com",
  },
  {
    id_client: 2,
    first_name: "Juan",
    last_name: "Pérez",
    email: "juan@example.com",
  },
];

describe("clientSearch", () => {
  it("encuentra por orden invertido y con tildes", () => {
    const ranked = rankClientsBySimilarity(clients, "perez juan");
    expect(ranked[0]?.id_client).toBe(2);

    const rankedWithTildes = rankClientsBySimilarity(clients, "pérez, juán");
    expect(rankedWithTildes[0]?.id_client).toBe(2);
  });

  it("tolera typo de una letra también en tokens cortos (3 letras)", () => {
    const ranked = rankClientsBySimilarity(clients, "aba nunez");
    expect(ranked[0]?.id_client).toBe(1);
  });
});
