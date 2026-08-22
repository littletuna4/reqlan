import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CERTIFICATE_JUST_COMPLETED_PARAM,
  CERTIFICATE_JUST_COMPLETED_VALUE,
  CERTIFICATE_TOKEN_PARAM,
  CERTS_ASSESSMENT_PATH,
  CERTS_CERTIFICATE_PATH,
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

describe("certs paths", () => {
  it("keeps assessment under /certs", () => {
    assert.equal(CERTS_ASSESSMENT_PATH, "/certs/assessment");
  });
});
