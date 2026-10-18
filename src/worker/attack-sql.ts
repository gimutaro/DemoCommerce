import initSqlJs from 'sql.js/dist/sql-wasm.js';
import wasm from 'sql.js/dist/sql-wasm.wasm?module';

// Cloudflare supplies a precompiled module. Do not compile downloaded Wasm.
export const attackSql = initSqlJs({
  instantiateWasm(imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance) => void) {
    const instance = new WebAssembly.Instance(wasm, imports);
    receive(instance);
    return instance.exports;
  },
} as Parameters<typeof initSqlJs>[0]);
