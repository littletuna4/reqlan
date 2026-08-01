import type { AstNode, LangiumCoreServices, LangiumDocument } from 'langium';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { URI } from 'langium';

export interface ParseResult {
    document: LangiumDocument;
    diagnostics: Array<{
        severity: number;
        line: number;
        character: number;
        message: string;
        text: string;
    }>;
    errorCount: number;
}

export async function parseDocument(fileName: string, services: LangiumCoreServices): Promise<ParseResult> {
    const extensions = services.LanguageMetaData.fileExtensions;
    if (!extensions.includes(path.extname(fileName))) {
        throw new Error(`Please choose a file with one of these extensions: ${extensions.join(', ')}.`);
    }

    if (!fs.existsSync(fileName)) {
        throw new Error(`File ${fileName} does not exist.`);
    }

    const document = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(
        URI.file(path.resolve(fileName))
    );
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    const diagnostics = (document.diagnostics ?? []).map(d => ({
        severity: d.severity ?? 0,
        line: d.range.start.line + 1,
        character: d.range.start.character + 1,
        message: typeof d.message === 'string' ? d.message : d.message.value,
        text: document.textDocument.getText(d.range)
    }));
    const errorCount = diagnostics.filter(d => d.severity === 1).length;

    return { document, diagnostics, errorCount };
}

export async function extractAstNode<T extends AstNode>(
    fileName: string,
    services: LangiumCoreServices
): Promise<T> {
    const { document, errorCount, diagnostics } = await parseDocument(fileName, services);
    if (errorCount > 0) {
        const details = diagnostics
            .filter(d => d.severity === 1)
            .map(d => `line ${d.line}: ${d.message}`)
            .join('\n');
        throw new Error(`Validation errors:\n${details}`);
    }
    return document.parseResult?.value as T;
}
