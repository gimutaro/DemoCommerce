declare module '*.wasm?module' { const module: WebAssembly.Module; export default module; }
declare module 'sql.js/dist/sql-wasm.js' { import initSqlJs from 'sql.js'; export default initSqlJs; }
