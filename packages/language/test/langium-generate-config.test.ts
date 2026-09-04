/**
 * langium generate must validate langium-config.json without throwing.
 * jsonschema 1.5.0 throws `ERR_INVALID_URL` for `#/$defs/languageItem` unless pinned to 1.4.1.
 * rq:["../../../reqlan rq/development/build.rq".typescript_compile]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const languageDir = join(dirname(fileURLToPath(import.meta.url)), '..');

interface JsonSchemaValidateResult {
    valid: boolean;
}

interface JsonSchemaModule {
    validate: (
        instance: unknown,
        schema: unknown,
        options: { nestedErrors: boolean }
    ) => JsonSchemaValidateResult;
}

describe('langium generate config', () => {
    // rq:["../../../reqlan rq/development/build.rq".typescript_compile]
    test('langium-cli schema validates langium-config.json', () => {
        const cliDir = join(languageDir, 'node_modules/langium-cli');
        const schema: unknown = JSON.parse(
            readFileSync(join(cliDir, 'langium-config-schema.json'), 'utf8')
        );
        const config: unknown = JSON.parse(
            readFileSync(join(languageDir, 'langium-config.json'), 'utf8')
        );
        const { validate } = createRequire(join(cliDir, 'lib/index.js'))(
            'jsonschema'
        ) as JsonSchemaModule;

        const result = validate(config, schema, { nestedErrors: true });
        expect(result.valid).toBe(true);
    });
});
