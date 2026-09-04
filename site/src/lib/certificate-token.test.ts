import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CORE_ASSESSMENT_ID, isAssessmentId } from "../content/assessment.js";
import {
  LEGACY_ASSESSMENT_ID,
  mintCertificateToken,
  normalizeCertificateClaims,
  parseCertificateToken,
} from "./certificate-token.js";

describe("certificate-token", () => {
  it("round-trips name, assessment id, and completion date", async () => {
    const completedAt = new Date("2026-08-03T10:00:00.000Z");
    const token = await mintCertificateToken({
      name: "Ada Lovelace",
      assessmentId: CORE_ASSESSMENT_ID,
      completedAt,
    });
    assert.ok(token.length > 20);
    assert.equal(token.includes("+"), false);
    assert.equal(token.includes("/"), false);

    const claims = await parseCertificateToken(token);
    assert.ok(claims);
    assert.equal(claims.n, "Ada Lovelace");
    assert.equal(claims.a, CORE_ASSESSMENT_ID);
    assert.equal(claims.d, completedAt.toISOString());
  });

  it("returns null for a tampered token", async () => {
    const token = await mintCertificateToken({
      name: "Grace Hopper",
      assessmentId: CORE_ASSESSMENT_ID,
    });
    const mutated = `${token.slice(0, -4)}zzzz`;
    const claims = await parseCertificateToken(mutated);
    assert.equal(claims, null);
  });

  it("returns null for empty or garbage input", async () => {
    assert.equal(await parseCertificateToken(""), null);
    assert.equal(await parseCertificateToken("not-a-token"), null);
  });

  it("rejects an empty name when minting", async () => {
    await assert.rejects(
      () =>
        mintCertificateToken({
          name: "   ",
          assessmentId: CORE_ASSESSMENT_ID,
        }),
      /Name/,
    );
  });

  it("rejects an empty assessment id when minting", async () => {
    await assert.rejects(
      () => mintCertificateToken({ name: "Ada Lovelace", assessmentId: "  " }),
      /Assessment/,
    );
  });

  it("rejects an unknown assessment id when minting", async () => {
    await assert.rejects(
      () =>
        mintCertificateToken({
          name: "Ada Lovelace",
          assessmentId: "not-a-quiz",
        }),
      /Unknown assessment/,
    );
  });

  it("maps a missing assessment id to the sole quiz", () => {
    const claims = normalizeCertificateClaims({
      n: "Ada Lovelace",
      d: "2026-08-03T10:00:00.000Z",
    });
    assert.ok(claims);
    assert.equal(claims.a, LEGACY_ASSESSMENT_ID);
    assert.equal(claims.a, CORE_ASSESSMENT_ID);
    assert.equal(isAssessmentId(LEGACY_ASSESSMENT_ID), true);
  });

  it("maps legacy ontology and references ids to core", () => {
    for (const legacyId of ["ontology", "references"] as const) {
      const claims = normalizeCertificateClaims({
        n: "Ada Lovelace",
        d: "2026-08-03T10:00:00.000Z",
        a: legacyId,
      });
      assert.ok(claims);
      assert.equal(claims.a, CORE_ASSESSMENT_ID);
    }
  });
});
