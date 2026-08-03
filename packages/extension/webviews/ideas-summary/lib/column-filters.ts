import type { ColumnFilter } from '../../../src/webview_module/shared/messages.js';

export interface ColumnFilterSpec {
    column: string;
    label: string;
    kind: 'text' | 'select' | 'none';
    options?: Array<{ value: string; label: string }>;
    /** When true, select allows multiple values. */
    multiple?: boolean;
}

export type { ColumnFilter };
