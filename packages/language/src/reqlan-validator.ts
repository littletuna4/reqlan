import type { AstNode, ValidationAcceptor, ValidationChecks } from 'langium';
import type { ReqlanAstType } from './generated/ast.js';
import {
    isIdea,
    isOneLinerIdea,
    type Model
} from './generated/ast.js';
import { importBindings, importedIdeaNames } from './reqlan-import-bindings.js';
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
        const seen = new Map<string, ImportBindingSource>();
        for (const importDecl of model.imports) {
            for (const binding of importBindings(importDecl)) {
                if (seen.has(binding.name)) {
                    accept('error', `'${binding.name}' is already defined in this file.`, {
                        node: binding.node,
                        property: binding.property
                    });
                } else {
                    seen.set(binding.name, binding);
                }
            }
        }
    }

    checkDuplicateIdeaNames(model: Model, accept: ValidationAcceptor): void {
        const seen = new Map<string, AstNode>();
        for (const importDecl of model.imports) {
            for (const binding of importBindings(importDecl)) {
                seen.set(binding.name, importDecl);
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
                importedIdeaNames(importDecl).includes(name)
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

type ImportBindingSource = ReturnType<typeof importBindings>[number];
