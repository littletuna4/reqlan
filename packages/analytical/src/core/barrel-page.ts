/**
 * Barrel a large `.rq` page into a container that imports one file per top-level idea.
 * Shared by CLI `barrel` and other headless tools.
 *
 * rq:["../../../reqlan rq/extension/features-commands.rq".barrel_page]
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import {
    createReqlanServices,
    fileBasenameAlias,
    ideaDeclarationText,
    isIdeaSet,
    isModel,
    isRefactorIdeaDeclaration,
    type Model,
    type RefactorIdeaDeclaration
} from '@reqlan/language';

export interface BarrelPagePlanOptions {
    /** Container idea name; defaults to sanitized source file basename. */
    containerName?: string;
    /** Source file name used when defaulting the container name (e.g. `features.rq`). */
    sourceFileName?: string;
}

export interface BarrelPageChildPlan {
    ideaName: string;
    /** Relative file name written next to the source (e.g. `alpha.rq`). */
    fileName: string;
    content: string;
}

export interface BarrelPagePlan {
    containerName: string;
    containerContent: string;
    children: BarrelPageChildPlan[];
    /** Top-level ideaset declarations preserved in the container file. */
    preservedIdeasets: string[];
}

export interface BarrelPageOptions extends BarrelPagePlanOptions {
    /** When true, compute the plan without writing files. */
    dryRun?: boolean;
}

export interface BarrelPageResult extends BarrelPagePlan {
    /** Absolute path of the barreled source file. */
    sourcePath: string;
    /** Absolute paths of child files that were (or would be) written. */
    createdPaths: string[];
    dryRun: boolean;
}

/**
 * Plan a barrel transform from source text (no filesystem writes).
 */
export async function planBarrelPage(
    sourceText: string,
    options: BarrelPagePlanOptions = {}
): Promise<BarrelPagePlan> {
    const services = createReqlanServices(EmptyFileSystem);
    const sourceFileName = options.sourceFileName ?? 'page.rq';
    const document = services.shared.workspace.LangiumDocumentFactory.fromString(
        sourceText,
        URI.parse(`file:///barrel-plan/${encodeURIComponent(sourceFileName)}`)
    ) as LangiumDocument<Model>;
    services.shared.workspace.LangiumDocuments.addDocument(document);
    await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

    const model = document.parseResult.value;
    if (!isModel(model)) {
        throw new Error('Failed to parse reqlan document for barrel page.');
    }

    const ideas: RefactorIdeaDeclaration[] = [];
    const ideasetTexts: string[] = [];
    for (const element of model.elements) {
        if (isRefactorIdeaDeclaration(element)) {
            ideas.push(element);
        } else if (isIdeaSet(element)) {
            const text = element.$cstNode
                ? document.textDocument.getText(element.$cstNode.range)
                : undefined;
            if (text) {
                ideasetTexts.push(text.trimEnd());
            }
        }
    }

    if (ideas.length === 0) {
        throw new Error('Barrel page requires at least one top-level idea.');
    }

    const containerName =
        options.containerName?.trim()
        || fileBasenameAlias(sourceFileName);
    if (!containerName) {
        throw new Error('Container idea name must not be empty.');
    }
    if (ideas.some(idea => idea.name === containerName)) {
        throw new Error(
            `Container name "${containerName}" conflicts with an idea being barreled; choose a different --name.`
        );
    }

    const siblingNames = new Set(ideas.map(idea => idea.name));
    const importPreamble = extractImportPreamble(document, model);

    const children: BarrelPageChildPlan[] = ideas.map(idea => {
        const declaration = ideaDeclarationText(document, idea);
        if (!declaration) {
            throw new Error(`Could not read declaration text for idea "${idea.name}".`);
        }
        const { text: rewritten, neededSiblings } = rewriteSiblingRefs(
            declaration.trimEnd(),
            idea.name,
            siblingNames
        );
        const siblingImports = neededSiblings
            .map(name => `import "./${name}.rq" as ${name}`)
            .join('\n');
        const parts = [importPreamble.trimEnd(), siblingImports, rewritten]
            .filter(part => part && part.length > 0);
        return {
            ideaName: idea.name,
            fileName: `${idea.name}.rq`,
            content: `${parts.join('\n\n')}\n`
        };
    });

    const importLines = children
        .map(child => `import "./${child.fileName}" as ${child.ideaName}`)
        .join('\n');
    const memberRefs = children
        .map(child => `    [${child.ideaName}.${child.ideaName}]`)
        .join('\n');
    const preservedBlock =
        ideasetTexts.length > 0 ? `\n\n${ideasetTexts.join('\n\n')}` : '';
    const containerContent =
        `${importLines}\n\n${containerName} {\n${memberRefs}\n}${preservedBlock}\n`;

    return {
        containerName,
        containerContent,
        children,
        preservedIdeasets: ideasetTexts
    };
}

/**
 * Barrel a `.rq` file on disk: write one child file per idea and replace the source with a container.
 */
export async function barrelPage(
    filePath: string,
    options: BarrelPageOptions = {}
): Promise<BarrelPageResult> {
    const sourcePath = resolve(filePath);
    if (!sourcePath.endsWith('.rq')) {
        throw new Error(`Barrel page expects a .rq file, got: ${filePath}`);
    }
    if (!existsSync(sourcePath)) {
        throw new Error(`File does not exist: ${sourcePath}`);
    }

    const sourceText = await readFile(sourcePath, 'utf8');
    const plan = await planBarrelPage(sourceText, {
        containerName: options.containerName,
        sourceFileName: basename(sourcePath)
    });

    const outDir = dirname(sourcePath);
    const createdPaths = plan.children.map(child => join(outDir, child.fileName));
    for (const childPath of createdPaths) {
        if (childPath === sourcePath) {
            throw new Error(
                `Refusing to overwrite the source file with a child idea file (${basename(childPath)}).`
            );
        }
        if (existsSync(childPath)) {
            throw new Error(`Refusing to overwrite existing file: ${childPath}`);
        }
    }

    const dryRun = options.dryRun === true;
    if (!dryRun) {
        await mkdir(outDir, { recursive: true });
        for (let i = 0; i < plan.children.length; i++) {
            await writeFile(createdPaths[i]!, plan.children[i]!.content, 'utf8');
        }
        await writeFile(sourcePath, plan.containerContent, 'utf8');
    }

    return {
        ...plan,
        sourcePath,
        createdPaths,
        dryRun
    };
}

function extractImportPreamble(document: LangiumDocument, model: Model): string {
    if (model.imports.length === 0) {
        return '';
    }
    const first = model.imports[0]?.$cstNode?.range.start;
    const last = model.imports[model.imports.length - 1]?.$cstNode?.range.end;
    if (!first || !last) {
        return '';
    }
    return document.textDocument.getText({
        start: { line: first.line, character: 0 },
        end: last
    });
}

/**
 * Rewrite same-file sibling idea refs `[other]` to `[other.other]` and record needed imports.
 * Leaves wiki links `[[...]]` and already-qualified refs untouched.
 */
export function rewriteSiblingRefs(
    text: string,
    selfName: string,
    siblingNames: ReadonlySet<string>
): { text: string; neededSiblings: string[] } {
    const needed = new Set<string>();
    const rewritten = text.replace(/\[\[([^\]]*)\]\]|\[([A-Za-z_][\w-]*)\]/g, (match, _wiki, local) => {
        if (local === undefined) {
            return match;
        }
        if (local === selfName || !siblingNames.has(local)) {
            return match;
        }
        needed.add(local);
        return `[${local}.${local}]`;
    });
    return {
        text: rewritten,
        neededSiblings: [...needed].sort()
    };
}
