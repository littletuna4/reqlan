/**
 * Pure helpers for applying a barrel-page plan via WorkspaceEdit.
 * rq:["../../../../reqlan rq/extension/features-commands.rq".barrel_page]
 * rq:["../../../../reqlan rq/extension/features-commands.rq".file_based_code_actions]
 */
import type { BarrelPagePlan } from '@reqlan/analytical';
import { fileBasenameAlias } from '@reqlan/language';
import { basename, dirname, join } from 'node:path';

export interface BarrelPageChildWrite {
    /** Absolute path of the child file to create. */
    absolutePath: string;
    content: string;
}

export interface BarrelPageApplyPlan {
    containerName: string;
    containerContent: string;
    children: BarrelPageChildWrite[];
}

/**
 * Map an analytical barrel plan onto absolute paths next to the source file.
 */
export function toBarrelApplyPlan(
    sourcePath: string,
    plan: BarrelPagePlan
): BarrelPageApplyPlan {
    const outDir = dirname(sourcePath);
    return {
        containerName: plan.containerName,
        containerContent: plan.containerContent,
        children: plan.children.map(child => ({
            absolutePath: join(outDir, child.fileName),
            content: child.content
        }))
    };
}

/**
 * Return absolute paths that already exist and would be overwritten by the plan.
 * Also rejects when a child path is the source file itself.
 */
export function findBarrelOverwriteConflicts(
    sourcePath: string,
    applyPlan: BarrelPageApplyPlan,
    exists: (absolutePath: string) => boolean
): string[] {
    const conflicts: string[] = [];
    for (const child of applyPlan.children) {
        if (child.absolutePath === sourcePath) {
            conflicts.push(child.absolutePath);
            continue;
        }
        if (exists(child.absolutePath)) {
            conflicts.push(child.absolutePath);
        }
    }
    return conflicts;
}

/** Default container idea name from the source file basename. */
export function defaultBarrelContainerName(sourcePath: string): string {
    return fileBasenameAlias(basename(sourcePath));
}
