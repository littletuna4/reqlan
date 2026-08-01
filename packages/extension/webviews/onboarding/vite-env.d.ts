/// <reference types="vite/client" />

declare module '*.rq?raw' {
    const content: string;
    export default content;
}
