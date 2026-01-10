import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import postcss from 'rollup-plugin-postcss';
import terser from '@rollup/plugin-terser';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

export default {
  input: 'src/client.ts',
  output: [
    {
      file: pkg.main,
      format: 'cjs',
      sourcemap: false,
      exports: 'named',
      intro: '"use client";',
    },
    {
      file: pkg.module || 'dist/index.esm.js',
      format: 'esm',
      sourcemap: false,
      intro: '"use client";',
    },
  ],
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    // heavy libs we want the consumer to bundle from node_modules instead of inlining
    'xlsx',
    'papaparse',
    'jschardet',
    'zustand',
    '@mantine/core',
    '@tabler/icons-react',
  ],
  onwarn(warning, warn) {
    if (
      warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
      typeof warning.message === 'string' &&
      warning.message.includes('use client')
    ) {
      return;
    }
    warn(warning);
  },
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false,
      extensions: ['.mjs', '.js', '.json', '.node', '.ts', '.tsx'],
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.lib.json',
      declaration: false,
      rootDir: 'src',
    }),
    postcss({
      inject: true,
      extract: false,
      minimize: true,
    }),
    terser({
      format: { comments: false },
      compress: { passes: 2 },
      mangle: true,
      maxWorkers: 1,
    }),
  ],
};