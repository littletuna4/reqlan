/**
 * Barrel a large `.rq` page into a container that imports one file per top-level idea.
 * The plan is computed by the native engine (`reqlan-parse`); this module only performs
 * the filesystem writes. Shared by CLI `barrel`, the extension code action, and headless tools.
 *
 * rq:["../../../../reqlan rq/extension/features-commands.rq".barrel_page]
 * rq:["../../../../reqlan rq/extension/features-commands.rq".file_based_code_actions]
 * rq:["../../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { loadNativeEngine } from '../native/load-native.js';

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
    const engine = loadNativeEngine();
    if (typeof engine.barrelPagePlan !== 'function') {
        throw new Error(
            'Native barrelPagePlan is missing; rebuild crates/reqlan-napi (cargo build -p reqlan-napi).'
        );
    }
    const plan = engine.barrelPagePlan(
        sourceText,
        options.containerName,
        options.sourceFileName ?? 'page.rq'
    ) as BarrelPagePlan;
    return {
        containerName: plan.containerName,
        containerContent: plan.containerContent,
        children: plan.children.map(child => ({
            ideaName: child.ideaName,
            fileName: child.fileName,
            content: child.content
        })),
        preservedIdeasets: plan.preservedIdeasets
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

/**
 * Rewrite same-file sibling idea refs `[other]` to `[other.other]` and record needed imports.
 * Leaves wiki links `[[...]]` and already-qualified refs untouched. Pure text helper mirrored
 * in the native barrel engine; kept in TS for webview edits and re-use without a native round-trip.
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
