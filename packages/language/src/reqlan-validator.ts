import type { AstNode, ValidationAcceptor, ValidationChecks } from 'langium';
import type { ReqlanAstType } from './generated/ast.js';
import {
    isFromImport,
    isIdea,
    isOneLinerIdea,
    isQualifiedImport,
    type Import,
    type Model
} from './generated/ast.js';
import type { ReqlanServices } from './reqlan-module.js';

/**
 * Registers validation hooks for the requirement graph AST.
 */
export function registerValidationChecks(services: ReqlanServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.ReqlanValidator;
    const checks: ValidationChecks<ReqlanAstType> = {
        Model: validator.checkModelDuplicates
    };
    registry.register(checks, validator);
}

/**
 * Custom validations for Reqlan documents.
 */
export class ReqlanValidator {

    checkModelDuplicates(model: Model, accept: ValidationAcceptor): void {
        this.checkDuplicateImportBindings(model, accept);
        this.checkDuplicateIdeaNames(model, accept);
    }

    checkDuplicateImportBindings(model: Model, accept: ValidationAcceptor): void {
        const seen = new Map<string, Import>();
        for (const importDecl of model.imports) {
            const name = importBindingName(importDecl);
            if (!name) {
                continue;
            }
            if (seen.has(name)) {
                if (importDecl.alias) {
                    accept('error', `'${name}' is already defined in this file.`, {
                        node: importDecl,
                        property: 'alias'
                    });
                } else if (isFromImport(importDecl) || isQualifiedImport(importDecl)) {
                    accept('error', `'${name}' is already defined in this file.`, {
                        node: importDecl,
                        property: 'idea'
                    });
                }
            } else {
                seen.set(name, importDecl);
            }
        }
    }

    checkDuplicateIdeaNames(model: Model, accept: ValidationAcceptor): void {
        const seen = new Map<string, AstNode>();
        for (const importDecl of model.imports) {
            const bindingName = importBindingName(importDecl);
            if (bindingName) {
                seen.set(bindingName, importDecl);
            }
        }
        for (const element of model.elements) {
            if (!isIdea(element) && !isOneLinerIdea(element)) {
                continue;
            }
            const name = element.name;
            if (seen.has(name)) {
                accept('error', `'${name}' is already defined in this file.`, {
                    node: element,
                    property: 'name'
                });
                continue;
            }
            const importedNameConflict = model.imports.some(importDecl =>
                (isFromImport(importDecl) || isQualifiedImport(importDecl))
                && importDecl.idea.$refText === name
            );
            if (importedNameConflict) {
                accept('error', `'${name}' is already defined in this file.`, {
                    node: element,
                    property: 'name'
                });
                continue;
            }
            seen.set(name, element);
        }
    }
}

function importBindingName(importDecl: Import): string | undefined {
    if (importDecl.alias) {
        return importDecl.alias;
    }
    if (isFromImport(importDecl) || isQualifiedImport(importDecl)) {
        return importDecl.idea.$refText;
    }
    return undefined;
}
