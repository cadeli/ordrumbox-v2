// Ambient module declarations for non-JS imports.
// Without them tsc rejects the side-effect import of the stylesheet
// (TS2882) and `import.meta.env` (TS2339), neither of which is JS code.
/* eslint-disable no-unused-vars */

/** Vite substitutes the values at build time. */
declare module '*.css'

interface ImportMetaEnv {
    readonly MODE: string
    readonly DEV: boolean
    readonly PROD: boolean
    readonly BASE_URL: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
