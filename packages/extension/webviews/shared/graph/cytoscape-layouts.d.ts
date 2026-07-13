/**
 * Ambient declarations for cytoscape layout extensions that ship no types.
 * They are registered via cytoscape.use(...).
 */
declare module 'cytoscape-fcose' {
    const ext: (cy: unknown) => void;
    export default ext;
}

declare module 'cytoscape-cola' {
    const ext: (cy: unknown) => void;
    export default ext;
}
