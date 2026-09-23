import { defineConfig, globalIgnores } from 'eslint/config'
import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

export default defineConfig([
    globalIgnores([
        'dist/**',
        'release/**',
        'coverage/**',
        'bak/**',
        'node_modules/**',
        'playwright-report/**',
        'test-results/**',
    ]),
    {
        files: ['**/*.{js,mjs,cjs}'],
        extends: [js.configs.recommended],
        rules: {
            'no-unused-vars': [
                'error',
                {
                    args: 'after-used',
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            'no-undef': 'error',
            'no-var': 'error',
            'prefer-const': 'error',
        },
    },
    {
        files: ['src/**/*.js', 'sw.js', 'vite.config.js', 'playwright.config.js'],
        languageOptions: {
            globals: { ...globals.browser },
        },
    },
    {
        files: ['src/core/timerworker.js'],
        languageOptions: {
            globals: { ...globals.worker },
        },
    },
    {
        files: ['tools/recorder-processor.js', 'src/audio/worklets/processors/**/*.js'],
        languageOptions: {
            globals: { ...globals.browser, ...globals.audioWorklet },
        },
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            globals: { ...globals.browser, ...globals.node, ...globals.vitest },
        },
    },
    {
        files: ['e2e/**/*.js'],
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },
        },
    },
    {
        files: ['scripts/**/*.mjs', '*.mjs', 'vite.config.js', 'playwright.config.js'],
        languageOptions: {
            globals: { ...globals.node },
        },
    },
    {
        files: ['electron-main.cjs'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: { ...globals.commonjs, ...globals.node },
        },
    },
    {
        files: ['src/logic/**/*.js', 'src/audio/**/*.js', 'src/patterns/**/*.js', 'src/model/**/*.js'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['**/ui/**', '**/ui/toast.js'],
                            message: 'Non-UI layers must not import from ui/ — use core/notify.js for toasts.',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['src/core/**/*.js', 'src/cache/**/*.js'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['**/ui/**', '**/logic/**', '**/audio/**'],
                            message: 'core/ and cache/ must not import from higher layers.',
                        },
                    ],
                },
            ],
        },
    },
    prettier,
])
