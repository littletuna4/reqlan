//@ts-check
/** Extension host and language server bundling — see reqlan rq/development/build.rq */
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

const success = watch ? 'Watch build succeeded' : 'Build succeeded';

function getTime() {
    const date = new Date();
    return `[${`${padZeroes(date.getHours())}:${padZeroes(date.getMinutes())}:${padZeroes(date.getSeconds())}`}] `;
}

function padZeroes(i) {
    return i.toString().padStart(2, '0');
}

const plugins = [{
    name: 'watch-plugin',
    setup(build) {
        build.onEnd(result => {
            if (result.errors.length === 0) {
                console.log(getTime() + success);
            }
        });
    },
}];

const objectGroupByPolyfill = `if(typeof Object.groupBy!=="function"){Object.groupBy=(items,keySelector)=>{const result=Object.create(null);let index=0;for(const item of items){const key=keySelector(item,index++);const group=result[key];if(group){group.push(item);}else{result[key]=[item];}}return result;};}`;

const ctx = await esbuild.context({
    // Entry points for the vscode extension and the language server
    entryPoints: {
        'extension/main': 'src/extension/main.ts',
        'language/main': 'src/language/main.ts',
        // Separate file so WorkerThreadAsyncParser can terminate a stuck lex/parse.
        'language/reqlan-parse-worker': '../language/src/reqlan-parse-worker.ts',
        // Fuzzy search scoring runs off the extension-host event loop.
        'extension/fuzzy-search-worker': '../analytical/src/analysis/fuzzy-search-worker.ts',
    },
    banner: {
        js: objectGroupByPolyfill
    },
    outdir: 'out',
    bundle: true,
    target: "ES2017",
    // VSCode's extension host is still using cjs, so we need to transform the code
    format: 'cjs',
    // To prevent confusing node, we explicitly use the `.cjs` extension
    outExtension: {
        '.js': '.cjs'
    },
    loader: { '.ts': 'ts' },
    external: ['vscode'],
    platform: 'node',
    sourcemap: !minify,
    minify,
    plugins
});

if (watch) {
    await ctx.watch();
} else {
    await ctx.rebuild();
    ctx.dispose();
}
