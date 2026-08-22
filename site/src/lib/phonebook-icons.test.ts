import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertPhonebookIconsRegistered,
  resolvePhonebookIcon,
} from "./phonebook-icons.js";
import { getPhonebookLink } from "./phonebook.js";

describe("phonebook icon registry", () => {
  // rq:["../../../reqlan rq/site/site.rq".icon_registry]
  // rq:["../../../reqlan rq/development/core.rq".phonebook_icon_keys]

  it("allows a link with no icon", () => {
    assert.doesNotThrow(() =>
      assertPhonebookIconsRegistered([{ id: "plain" }]),
    );
    assert.equal(resolvePhonebookIcon(undefined), undefined);
  });

  it("throws when a provided icon is not in the registry", () => {
    assert.throws(
      () =>
        assertPhonebookIconsRegistered([
          {
            id: "ghost",
            icon: { set: "simple-icons", name: "not-registered" },
          },
        ]),
      /Missing phonebook icon registry entry for ghost: simple-icons:not-registered/,
    );
  });

  it("resolves a registered phonebook icon", () => {
    const github = getPhonebookLink("github");
    assert.ok(github.icon);
    assert.ok(resolvePhonebookIcon(github.icon));
  });
});
