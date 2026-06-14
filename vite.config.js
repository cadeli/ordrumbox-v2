import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: '.',
    base: './',
    publicDir: false,

    test: {
        setupFiles: ['./tests/setup.js'],
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        manifest: true,
        minify: 'terser',
        target: 'esnext',

        terserOptions: {
            compress: {
                drop_console: true,  // no console.log for prod
                drop_debugger: true
            }
        },

        // 3. Assets
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'), // main entry point
            },
            output: {
                entryFileNames: 'assets/js/[name].[hash].js',
                chunkFileNames: 'assets/js/[name].[hash].js',
                manualChunks(id) {
                    if (id.includes('src/audio/')) return 'audio-engine';
                    if (id.includes('src/patterns/')) return 'pattern-core';
                },
                assetFileNames: ({ name }) => {
                    if (/\.wav$/.test(name ?? '')) {
                        return 'assets/audio/[name].[hash][extname]';
                    }
                    if (/\.(gif|jpe?g|png|svg)$/.test(name ?? '')) {
                        return 'assets/images/[name].[hash][extname]';
                    }
                    if (/\.css$/.test(name ?? '')) {
                        return 'assets/css/[name].[hash][extname]';
                    }
                    if (/\.json$/.test(name ?? '')) {
                        return 'assets/json/[name].[hash][extname]';
                    }

                    return 'assets/[name].[hash][extname]';
                },
            },
        },
    },

    // 4. Dev server
    server: {
        port: 3000,
        open: true, // Open navigator
    },


});