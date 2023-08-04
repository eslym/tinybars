import ts from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

/** @type {import('rollup').RollupOptions} */
const config = {
    input: {
        index: 'src/index.ts',
        runtime: 'src/runtime.ts',
        rollup: 'src/rollup.ts'
    },
    plugins: [ts(), resolve(), commonjs()]
};

/** @type {import('rollup').RollupOptions[]} */
export default [
    {
        ...config,
        output: {
            dir: 'dist',
            format: 'cjs',
            entryFileNames: '[name].cjs',
            sourcemap: true
        }
    },
    {
        ...config,
        output: {
            dir: 'dist',
            format: 'esm',
            entryFileNames: '[name].js',
            sourcemap: true
        }
    }
];
