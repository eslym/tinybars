import type { Plugin } from 'rollup';
import type { CompileOptions } from './index.js';
import { compile } from './index.js';

export type TinyBarsRollupOptions = Omit<CompileOptions, 'format'> & {
    extensions?: string[];
};

export default function tinybars(options: TinyBarsRollupOptions = {}): Plugin {
    options = {
        extensions: ['.hbs']
    };
    return {
        name: 'tinybars',
        transform(code, id) {
            if (!options.extensions?.some((ext) => id.endsWith(ext))) {
                return null;
            }
            const res = compile(code, {
                ...options,
                format: 'esm',
                srcName: id
            });
            return {
                code: res.code,
                map: res.sourceMap
            };
        }
    };
}
