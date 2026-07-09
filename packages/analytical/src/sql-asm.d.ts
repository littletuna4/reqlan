declare module 'sql.js/dist/sql-asm.js' {
    interface SqlJsStatement {
        step(): boolean;
        getAsObject(): Record<string, unknown>;
        free(): void;
    }

    interface SqlJsDatabase {
        run(sql: string, params?: unknown[]): void;
        exec(sql: string, params?: unknown[]): unknown;
        prepare(sql: string, params?: unknown[]): SqlJsStatement;
        export(): Uint8Array;
        close(): void;
    }

    interface SqlJsModule {
        Database: new(data?: Uint8Array | ArrayLike<number>) => SqlJsDatabase;
    }

    export default function initSqlJs(config?: object): Promise<SqlJsModule>;
}
