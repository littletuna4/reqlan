export interface PhysicsCoreSettings {
    gravity: number;
    repulsion: number;
    linkStrength: number;
    linkDistance: number;
    damping: number;
    maxVelocity: number;
    minSeparation: number;
    restSpeed: number;
    restTicks: number;
    /** Skip pairwise repulsion beyond this distance (px). */
    repulsionCutoff?: number;
}

export interface PhysicsEdge {
    sourceId: string;
    targetId: string;
}

export interface PhysicsStepState {
    ids: string[];
    xs: Float64Array;
    ys: Float64Array;
    fxs: Float64Array;
    fys: Float64Array;
    velocities: Map<string, { vx: number; vy: number }>;
    pinnedIds: ReadonlySet<string>;
    edges: ReadonlyArray<PhysicsEdge>;
}

export declare const ReqlanGraphPhysics: {
    DEFAULT_PHYSICS_SETTINGS: PhysicsCoreSettings;
    hashAngle(seed: string): number;
    accumulateForces(state: PhysicsStepState, settings: PhysicsCoreSettings): void;
    integrateFromForces(state: PhysicsStepState, settings: PhysicsCoreSettings): number;
    stepPhysics(state: PhysicsStepState, settings: PhysicsCoreSettings): number;
};

export declare const DEFAULT_PHYSICS_SETTINGS: PhysicsCoreSettings;
export declare function hashAngle(seed: string): number;
export declare function accumulateForces(state: PhysicsStepState, settings: PhysicsCoreSettings): void;
export declare function integrateFromForces(state: PhysicsStepState, settings: PhysicsCoreSettings): number;
export declare function stepPhysics(state: PhysicsStepState, settings: PhysicsCoreSettings): number;
