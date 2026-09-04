import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CERTIFICATE_JUST_COMPLETED_PARAM,
  CERTIFICATE_JUST_COMPLETED_VALUE,
  CERTIFICATE_TOKEN_PARAM,
  CERTS_ASSESSMENT_PATH,
  CERTS_CERTIFICATE_PATH,
  assessmentPath,
  assessmentsEntryPath,
  certificatePath,
  isJustCompletedParam,
} from "./certs-paths.js";

describe("certificatePath", () => {
  it("builds the shareable certificate URL from the token", () => {
    const href = certificatePath("token-value");
    const url = new URL(href, "https://reqlan.example");
    assert.equal(url.pathname, `${CERTS_CERTIFICATE_PATH}/`);
    assert.equal(url.searchParams.get(CERTIFICATE_TOKEN_PARAM), "token-value");
    assert.equal(url.searchParams.get(CERTIFICATE_JUST_COMPLETED_PARAM), null);
  });

  it("adds just=1 for the just-completed view", () => {
    const href = certificatePath("token-value", { justCompleted: true });
    const url = new URL(href, "https://reqlan.example");
    assert.equal(
      url.searchParams.get(CERTIFICATE_JUST_COMPLETED_PARAM),
      CERTIFICATE_JUST_COMPLETED_VALUE,
    );
    assert.equal(url.searchParams.get(CERTIFICATE_TOKEN_PARAM), "token-value");
  });
});

describe("isJustCompletedParam", () => {
  it("accepts only the just-completed value", () => {
    assert.equal(isJustCompletedParam("1"), true);
    assert.equal(isJustCompletedParam("true"), false);
    assert.equal(isJustCompletedParam(null), false);
  });
});

describe("assessmentPath", () => {
  it("builds the catalog path with no id", () => {
    assert.equal(assessmentPath(), `${CERTS_ASSESSMENT_PATH}/`);
    assert.equal(assessmentPath(""), `${CERTS_ASSESSMENT_PATH}/`);
  });

  it("builds a quiz path from the assessment id", () => {
    assert.equal(assessmentPath("core"), `${CERTS_ASSESSMENT_PATH}/core/`);
  });
});

describe("assessmentsEntryPath", () => {
  it("uses the sole quiz path when there is one assessment", () => {
    assert.equal(
      assessmentsEntryPath([{ id: "core" }]),
      `${CERTS_ASSESSMENT_PATH}/core/`,
    );
  });

  it("uses the catalog when there are multiple assessments", () => {
    assert.equal(
      assessmentsEntryPath([{ id: "core" }, { id: "advanced" }]),
      `${CERTS_ASSESSMENT_PATH}/`,
    );
  });
});

describe("certs paths", () => {
  it("keeps assessment under /certs", () => {
    assert.equal(CERTS_ASSESSMENT_PATH, "/certs/assessment");
  });
});
