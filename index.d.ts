declare module '@eslym/tinybars' {
    export interface CompileOptions {
        srcName?: string;
        inputVar?: string;
        dataVar?: string;
        omitComments?: boolean;
    }
    export function compile(
        str: string,
        options?: CompileOptions
    ): { code: string; sourceMap: string };

    export type TinybarsFunc = (
        data: any,
        context?: object,
        escapeFunc?: (str: string) => string
    ) => string;
}

declare module '@eslym/tinybars/runtime' {
    export default function escapeHTML(str: string): string;
}

declare module '@eslym/tinybars/rollup' {
    import type { Plugin } from 'rollup';
    import type { CompileOptions } from '@eslym/tinybars';

    export type TinyBarsRollupOptions = Omit<CompileOptions, 'format'> & {
        extensions?: string[];
    };

    export default function tinybars(options: TinyBarsRollupOptions = {}): Plugin;
}
