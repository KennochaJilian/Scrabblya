import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
await build({entryPoints:[fileURLToPath(new URL('../../mobile/src/engine.ts',import.meta.url))],outfile:fileURLToPath(new URL('../dist/engine.mjs',import.meta.url)),bundle:true,platform:'node',format:'esm',target:'node22'});
