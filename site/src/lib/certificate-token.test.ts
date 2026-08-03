import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mintCertificateToken,
  parseCertificateToken,
} from "./certificate-token.js";

describe("certificate-token", () => {
  it("round-trips name and completion date", async () => {
    const completedAt = new Date("2026-08-03T10:00:00.000Z");
    const token = await mintCertificateToken({
      name: "Ada Lovelace",
      completedAt,
    });
    assert.ok(token.length > 20);
    assert.equal(token.includes("+"), false);
    assert.equal(token.includes("/"), false);

    const claims = await parseCertificateToken(token);
    assert.ok(claims);
    assert.equal(claims.n, "Ada Lovelace");
    assert.equal(claims.d, completedAt.toISOString());
  });

  it("returns null for a tampered token", async () => {
    const token = await mintCertificateToken({ name: "Grace Hopper" });
    const mutated = `${token.slice(0, -4)}zzzz`;
    const claims = await parseCertificateToken(mutated);
    assert.equal(claims, null);
  });

  it("returns null for empty or garbage input", async () => {
    assert.equal(await parseCertificateToken(""), null);
    assert.equal(await parseCertificateToken("not-a-token"), null);
  });

  it("rejects an empty name when minting", async () => {
    await assert.rejects(() => mintCertificateToken({ name: "   " }), /Name/);
  });
});
