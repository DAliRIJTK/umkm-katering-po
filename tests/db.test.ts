import { describe, expect, it } from "vitest";
import { getDb } from "../src/lib/db";

describe("pglite postgres smoke test", () => {
  it("runs PostgreSQL DDL and RETURNING queries offline", async () => {
    const db = await getDb("memory://");
    await db.exec(`
      CREATE TABLE items (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        price_idr INTEGER NOT NULL CHECK (price_idr > 0)
      );
    `);
    const res = await db.query<{ id: number; name: string; price_idr: number }>(
      "INSERT INTO items (name, price_idr) VALUES ($1, $2) RETURNING id, name, price_idr",
      ["Kopi Susu", 18000]
    );
    expect(res.rows[0]).toEqual({ id: 1, name: "Kopi Susu", price_idr: 18000 });
    await db.close();
  });
});
