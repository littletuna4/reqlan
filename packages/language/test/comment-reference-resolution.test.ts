import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { URI, type LangiumDocument } from "langium";
import { NodeFileSystem } from "langium/node";
import { expandToString as s } from "langium/generate";
import { clearDocuments } from "langium/test";
import type { Model } from "@reqlan/language";
import { createReqlanServices } from "../src/reqlan-module.js";
import { ReqlanDocumentBuilder } from "../src/reqlan-document-builder.js";
import {
  COMMENT_REFERENCE_MISSING_FILE,
  COMMENT_REFERENCE_MISSING_IDEA,
  collectCommentReferenceIssues,
  presentCommentReferences,
  presentCommentReferencesForDocument,
  shouldRelinkCommentReferences,
} from "../src/reqlan-comment-diagnostics.js";

const repoDir = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("comment reference resolution", () => {
  // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_resolution_error]
  test("reports an error when a comment reference file does not exist", () => {
    const text = '// rq:["./missing.rq".demo]\n';
    const presented = presentCommentReferences(
      text,
      "/src",
      { exists: () => false },
      posix.resolve,
    );
    expect(presented.links).toHaveLength(0);
    expect(presented.diagnostics).toHaveLength(1);
    expect(presented.diagnostics[0]?.code).toBe(COMMENT_REFERENCE_MISSING_FILE);
    expect(presented.diagnostics[0]?.message).toBe(
      "Could not resolve comment reference file './missing.rq'.",
    );
  });

  // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_resolution_error]
  test("does not create a document link for a missing comment reference file", () => {
    const presented = presentCommentReferences(
      '// see rq:["../nope.rq".idea] here\n',
      "/workspace/pkg",
      { exists: () => false },
      posix.resolve,
    );
    expect(presented.links).toEqual([]);
  });

  // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_resolution_error]
  test("creates a document link when the comment reference file and idea exist", () => {
    const text = '// rq:["./main.rq".demo]\n';
    const presented = presentCommentReferences(
      text,
      "/src",
      {
        exists: (absolutePath) =>
          absolutePath === posix.resolve("/src", "./main.rq"),
        declaresIdea: (_absolutePath, idea) => idea === "demo",
      },
      posix.resolve,
    );
    expect(presented.diagnostics).toHaveLength(0);
    expect(presented.links).toHaveLength(1);
    expect(presented.links[0]?.targetPath).toBe(
      posix.resolve("/src", "./main.rq"),
    );
    expect(presented.links[0]?.idea).toBe("demo");
  });

  // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_resolution_error]
  test("reports an error when the comment reference idea is missing from the file", () => {
    const presented = presentCommentReferences(
      '// rq:["./main.rq".absent]\n',
      "/src",
      {
        exists: () => true,
        declaresIdea: () => false,
      },
      posix.resolve,
    );
    expect(presented.links).toHaveLength(0);
    expect(presented.diagnostics[0]?.code).toBe(COMMENT_REFERENCE_MISSING_IDEA);
    expect(presented.diagnostics[0]?.message).toBe(
      "Could not resolve comment reference to idea 'absent'.",
    );
  });

  // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_resolution_error]
  // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
  test("suppresses comment reference errors on the line after //rq-ignore-error", () => {
    const text = s`
            //rq-ignore-error
            // rq:["./missing.rq".demo]
        `;
    const presented = presentCommentReferences(
      text,
      "/src",
      { exists: () => false },
      posix.resolve,
    );
    expect(presented.diagnostics).toHaveLength(0);
    expect(presented.links).toHaveLength(0);
  });

  // rq:["../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq".comment_reference_resolution_error_state]
  test("shares one presentation so a matching idea clears the underline and adds a link", () => {
    const declared = new Set<string>();
    const host = {
      exists: () => true,
      declaresIdea: (_absolutePath: string, idea: string) => declared.has(idea),
    };
    const text = '// rq:["./main.rq".elevator_pitch]\n';
    const missing = presentCommentReferences(text, "/src", host, posix.resolve);
    expect(missing.diagnostics).toHaveLength(1);
    expect(missing.diagnostics[0]?.code).toBe(COMMENT_REFERENCE_MISSING_IDEA);
    expect(missing.links).toHaveLength(0);

    declared.add("elevator_pitch");
    const resolved = presentCommentReferences(
      text,
      "/src",
      host,
      posix.resolve,
    );
    expect(resolved.diagnostics).toHaveLength(0);
    expect(resolved.links).toHaveLength(1);
    expect(resolved.links[0]?.idea).toBe("elevator_pitch");
  });
});

describe("comment reference resolution in .rq documents", () => {
  const services = createReqlanServices(NodeFileSystem);

  afterEach(async () => {
    const documents = services.shared.workspace.LangiumDocuments.all.toArray();
    if (documents.length > 0) {
      await clearDocuments(services.shared, documents);
    }
  });

  async function parseAt(
    path: string,
    text: string,
  ): Promise<LangiumDocument<Model>> {
    const document =
      services.shared.workspace.LangiumDocumentFactory.fromString(
        text,
        URI.parse(pathToFileURL(path).href),
      ) as LangiumDocument<Model>;
    services.shared.workspace.LangiumDocuments.addDocument(document);
    await services.shared.workspace.DocumentBuilder.build([document], {
      validation: false,
    });
    return document;
  }

  // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_resolution_error]
  test("reports a missing comment reference file in a loaded document", async () => {
    const sourcePath = join(repoDir, "reqlan rq/language/syntax.rq");
    const document = await parseAt(
      sourcePath,
      s`
            demo {
                body
            }` +
        // rq-ignore-error
        `            // rq:["./does-not-exist.rq".missing]
        `,
    );
    const issues = collectCommentReferenceIssues(
      document,
      services.shared.workspace.LangiumDocuments,
      services.shared.workspace.FileSystemProvider,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe(COMMENT_REFERENCE_MISSING_FILE);
    expect(issues[0]?.message).toBe(
      "Could not resolve comment reference file './does-not-exist.rq'.",
    );
  });

  // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_resolution_error]
  test("reports a missing comment reference idea in a loaded file", async () => {
    const targetPath = join(repoDir, "reqlan rq/language/syntax.rq");
    const sourcePath = join(repoDir, "reqlan rq/language/imports.rq");
    const target = await parseAt(
      targetPath,
      s`
            present_idea {
                body
            }
        `,
    );
    const source = await parseAt(
      sourcePath,
      s`
            host {
                body
            }` +
        // rq-ignore-error
        `            // rq:["./syntax.rq".absent_idea]
        `,
    );
    await services.shared.workspace.DocumentBuilder.build([target, source], {
      validation: false,
    });
    const issues = collectCommentReferenceIssues(
      source,
      services.shared.workspace.LangiumDocuments,
      services.shared.workspace.FileSystemProvider,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe(COMMENT_REFERENCE_MISSING_IDEA);
    expect(issues[0]?.message).toBe(
      "Could not resolve comment reference to idea 'absent_idea'.",
    );
  });

  // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_resolution_error]
  test("accepts a resolved comment reference in a loaded document", async () => {
    const targetPath = join(repoDir, "reqlan rq/language/syntax.rq");
    const sourcePath = join(repoDir, "reqlan rq/language/imports.rq");
    const target = await parseAt(
      targetPath,
      s`
            present_idea {
                body
            }
        `,
    );
    const source = await parseAt(
      sourcePath,
      s`
            host {
                body
            }` +
        // rq-ignore-error
        `            // rq:["./syntax.rq".present_idea]
        `,
    );
    await services.shared.workspace.DocumentBuilder.build([target, source], {
      validation: false,
    });
    const issues = collectCommentReferenceIssues(
      source,
      services.shared.workspace.LangiumDocuments,
      services.shared.workspace.FileSystemProvider,
    );
    expect(issues).toHaveLength(0);
  });

  // rq:["../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq".comment_reference_resolution_error_state]
  test("publishes a missing-idea diagnostic and no document link until the idea exists", async () => {
    const targetPath = join(repoDir, "reqlan rq/language/syntax.rq");
    const sourcePath = join(repoDir, "reqlan rq/language/imports.rq");
    const target = await parseAt(
      targetPath,
      s`
            present_idea {
                body
            }
        `,
    );
    const source = await parseAt(
      sourcePath,
      s`
            host {
                body
            }` +
        // rq-ignore-error
        `            // rq:["./syntax.rq".elevator_pitch]
        `,
    );
    await services.shared.workspace.DocumentBuilder.build([target, source], {
      validation: true,
    });
    const missingIdea = (source.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.code === COMMENT_REFERENCE_MISSING_IDEA,
    );
    expect(missingIdea).toHaveLength(1);
    expect(missingIdea[0]?.message).toBe(
      "Could not resolve comment reference to idea 'elevator_pitch'.",
    );
    const presented = presentCommentReferencesForDocument(
      source,
      services.shared.workspace.LangiumDocuments,
      services.shared.workspace.FileSystemProvider,
    );
    expect(presented.diagnostics).toHaveLength(1);
    expect(presented.links).toHaveLength(0);

    const links =
      await services.Reqlan.lsp.DocumentLinkProvider?.getDocumentLinks(source, {
        textDocument: { uri: source.textDocument.uri },
      });
    expect(
      links?.some((link) => link.target?.includes("syntax.rq")),
    ).toBeFalsy();
  });

  // rq:["../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq".comment_reference_resolution_error_state]
  test("clears the underline and creates a link after a matching idea is added", async () => {
    const targetPath = join(repoDir, "reqlan rq/language/syntax.rq");
    const sourcePath = join(repoDir, "reqlan rq/language/imports.rq");
    const target = await parseAt(
      targetPath,
      s`
            present_idea {
                body
            }
        `,
    );
    const source = await parseAt(
      sourcePath,
      s`
            host {
                body
            }` +
        // rq-ignore-error
        `            // rq:["./syntax.rq".elevator_pitch]
        `,
    );
    await services.shared.workspace.DocumentBuilder.build([target, source], {
      validation: true,
    });
    expect(
      source.diagnostics?.some(
        (diagnostic) => diagnostic.code === COMMENT_REFERENCE_MISSING_IDEA,
      ),
    ).toBe(true);

    await clearDocuments(services.shared, [target]);
    const updatedTarget = await parseAt(
      targetPath,
      s`
            present_idea {
                body
            }
            elevator_pitch {
                body
            }
        `,
    );
    await services.shared.workspace.DocumentBuilder.build(
      [updatedTarget, source],
      { validation: true },
    );

    const missingIdea = (source.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.code === COMMENT_REFERENCE_MISSING_IDEA,
    );
    expect(missingIdea).toHaveLength(0);
    const presented = presentCommentReferencesForDocument(
      source,
      services.shared.workspace.LangiumDocuments,
      services.shared.workspace.FileSystemProvider,
    );
    expect(presented.diagnostics).toHaveLength(0);
    expect(presented.links).toHaveLength(1);
    expect(presented.links[0]?.idea).toBe("elevator_pitch");
  });

  // rq:["../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq".comment_reference_resolution_error_state]
  test("relinks documents that still show a missing comment-reference idea", () => {
    const document = {
      textDocument: {
        getText: () => 'host {}\n// rq:["./syntax.rq".elevator_pitch]\n',
      },
      diagnostics: [{ code: COMMENT_REFERENCE_MISSING_IDEA }],
    } as unknown as LangiumDocument;
    expect(shouldRelinkCommentReferences(document, new Set())).toBe(true);
    expect(
      shouldRelinkCommentReferences(
        {
          textDocument: { getText: () => "host {}\n" },
          diagnostics: [{ code: COMMENT_REFERENCE_MISSING_IDEA }],
        } as unknown as LangiumDocument,
        new Set(),
      ),
    ).toBe(false);
  });
});

describe("comment reference resolution after workspace updates", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // rq:["../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq".comment_reference_resolution_error_state]
  test("revalidates comment-reference underlines when a matching idea is created on disk", async () => {
    const services = createReqlanServices(NodeFileSystem);
    expect(services.shared.workspace.DocumentBuilder).toBeInstanceOf(
      ReqlanDocumentBuilder,
    );

    const dir = mkdtempSync(join(tmpdir(), "reqlan-comment-ref-state-"));
    tempDirs.push(dir);
    const targetPath = join(dir, "target.rq");
    const sourcePath = join(dir, "source.rq");
    writeFileSync(targetPath, "other {}\n");
    writeFileSync(
      sourcePath,
      'host {}\n// rq:["./target.rq".elevator_pitch]\n',
    );

    const targetUri = URI.parse(pathToFileURL(targetPath).href);
    const sourceUri = URI.parse(pathToFileURL(sourcePath).href);
    const target =
      (await services.shared.workspace.LangiumDocumentFactory.fromUri(
        targetUri,
      )) as LangiumDocument<Model>;
    const source =
      (await services.shared.workspace.LangiumDocumentFactory.fromUri(
        sourceUri,
      )) as LangiumDocument<Model>;
    services.shared.workspace.LangiumDocuments.addDocument(target);
    services.shared.workspace.LangiumDocuments.addDocument(source);
    await services.shared.workspace.DocumentBuilder.build([target, source], {
      validation: true,
    });

    expect(
      source.diagnostics?.some(
        (diagnostic) => diagnostic.code === COMMENT_REFERENCE_MISSING_IDEA,
      ),
    ).toBe(true);

    writeFileSync(targetPath, "elevator_pitch {}\n");
    await services.shared.workspace.DocumentBuilder.update([targetUri], []);

    expect(
      source.diagnostics?.some(
        (diagnostic) => diagnostic.code === COMMENT_REFERENCE_MISSING_IDEA,
      ),
    ).toBe(false);
    const presented = presentCommentReferencesForDocument(
      source,
      services.shared.workspace.LangiumDocuments,
      services.shared.workspace.FileSystemProvider,
    );
    expect(presented.diagnostics).toHaveLength(0);
    expect(presented.links).toHaveLength(1);
    expect(presented.links[0]?.idea).toBe("elevator_pitch");

    const documents = services.shared.workspace.LangiumDocuments.all.toArray();
    if (documents.length > 0) {
      await clearDocuments(services.shared, documents);
    }
  });
});
