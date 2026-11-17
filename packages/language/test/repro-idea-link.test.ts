/**
 * Regression for: anonymous qualified reference `["target.rq".idea]`
 * where `collectFileLinks(..., {includeIdeaReferences:false})` must yield the idea link.
 * rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export]
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { URI, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { createReqlanServices } from '../src/reqlan-module.js';
import { collectFileLinks } from '../src/reqlan-file-link-resolver.js';
import { type Model } from '../src/generated/ast.js';

let fileServices: ReturnType<typeof createReqlanServices>;

beforeAll(() => {
    fileServices = createReqlanServices(NodeFileSystem);
});

afterEach(() => {
    fileServices.shared.workspace.LangiumDocuments.all.forEach(doc =>
        fileServices.shared.workspace.LangiumDocuments.deleteDocument(doc.uri)
    );
});

describe('collectFileLinks with includeIdeaReferences:false', () => {
    // rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export]
    test('returns idea link for anonymous qualified reference ["./target.rq".html_export]', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'replink-unit-'));
        try {
            const targetPath = join(dir, 'target.rq');
            writeFileSync(targetPath, 'html_export { body }\n');
            const consumerPath = join(dir, 'consumer.rq');
            writeFileSync(consumerPath, 'host { see ["./target.rq".html_export] }\n');

            const consumer = fileServices.shared.workspace.LangiumDocumentFactory.fromString(
                readFileSync(consumerPath, 'utf8'),
                URI.parse(pathToFileURL(consumerPath).href)
            ) as LangiumDocument<Model>;
            const target = fileServices.shared.workspace.LangiumDocumentFactory.fromString(
                readFileSync(targetPath, 'utf8'),
                URI.parse(pathToFileURL(targetPath).href)
            ) as LangiumDocument<Model>;
            fileServices.shared.workspace.LangiumDocuments.addDocument(target);
            fileServices.shared.workspace.LangiumDocuments.addDocument(consumer);
            await fileServices.shared.workspace.DocumentBuilder.build([target, consumer], { validation: false });

            const links = collectFileLinks(
                consumer,
                fileServices.shared.workspace.LangiumDocuments,
                fileServices.shared.workspace.FileSystemProvider,
                undefined,
                { includeIdeaReferences: false }
            );
            const fileLink = links.find(l => consumer.textDocument.getText(l.sourceRange).includes('target.rq'));
            const ideaLink = links.find(l => consumer.textDocument.getText(l.sourceRange) === 'html_export');

            expect(fileLink).toBeDefined();
            expect(ideaLink).toBeDefined();
            expect(ideaLink?.targetUri).toContain('target.rq');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('ReqlanDocumentLinkProvider deduplication', () => {
    // rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export]
    test('returns exactly one link per range for anonymous qualified reference', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'replink-integration-'));
        try {
            const targetPath = join(dir, 'target.rq');
            writeFileSync(targetPath, 'html_export { body }\n');
            const consumerPath = join(dir, 'consumer.rq');
            writeFileSync(consumerPath, 'host { see ["./target.rq".html_export] }\n');

            const consumer = fileServices.shared.workspace.LangiumDocumentFactory.fromString(
                readFileSync(consumerPath, 'utf8'),
                URI.parse(pathToFileURL(consumerPath).href)
            ) as LangiumDocument<Model>;
            const target = fileServices.shared.workspace.LangiumDocumentFactory.fromString(
                readFileSync(targetPath, 'utf8'),
                URI.parse(pathToFileURL(targetPath).href)
            ) as LangiumDocument<Model>;
            fileServices.shared.workspace.LangiumDocuments.addDocument(target);
            fileServices.shared.workspace.LangiumDocuments.addDocument(consumer);
            await fileServices.shared.workspace.DocumentBuilder.build([target, consumer], { validation: false });

            const links = await fileServices.Reqlan.lsp.DocumentLinkProvider?.getDocumentLinks(consumer, {
                textDocument: { uri: consumer.textDocument.uri }
            }) ?? [];

            const fileLinks = links.filter(l => consumer.textDocument.getText(l.range).includes('target.rq'));
            const ideaLinks = links.filter(l => consumer.textDocument.getText(l.range) === 'html_export');

            expect(fileLinks.length).toBe(1);
            expect(ideaLinks.length).toBe(1);
            expect(ideaLinks[0].target).toContain('target.rq');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});