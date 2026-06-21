import type { ValidationChecks } from 'langium';
import type { ReqlanAstType } from './generated/ast.js';
import type { ReqlanServices } from './reqlan-module.js';

/**
 * Registers validation hooks for the requirement graph AST.
 */
export function registerValidationChecks(services: ReqlanServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.ReqlanValidator;
    const checks: ValidationChecks<ReqlanAstType> = {};
    registry.register(checks, validator);
}

/**
 * Custom validations for Reqlan documents.
 */
export class ReqlanValidator {
}
