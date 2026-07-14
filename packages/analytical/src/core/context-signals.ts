/**
 * Context signals and focus synthesis for context-scope v2.
 * per ["../../../../reqlan rq/extension/module/context-scope-v2.rq"]
 */

export type ContextRiskLevel = 'low' | 'medium' | 'high';
export type ContextCoverageLevel = 'unknown' | 'partial' | 'complete';
export type ContextHotspotBand = 'low' | 'medium' | 'high';

export interface RelationshipSignals {
    parentCount: number;
    childCount: number;
    inboundCount: number;
    outboundCount: number;
    /** Inbound idea references that are not in the ancestor (parent) set. */
    dependentCount: number;
}

export interface DevelopmentHistorySignals {
    createdAt?: string;
    modifiedAt?: string;
    /** Whole days since createdAt; undefined when unknown. */
    ageDays?: number;
    /** Whole days since modifiedAt; undefined when unknown. */
    timeSinceTouchedDays?: number;
}

export interface LifecycleSignals {
    createdAt?: string;
    lastEditedAt?: string;
    status?: string;
}

export interface RiskSignals {
    highFanout: boolean;
    unresolvedRefs: boolean;
    recentlyTouched: boolean;
    flags: string[];
}

export interface QualitySignals {
    unresolvedCount: number;
    hasStatus: boolean;
}

export interface ContextSignals {
    focusIdeaId?: string;
    relationship?: RelationshipSignals;
    developmentHistory?: DevelopmentHistorySignals;
    lifecycle?: LifecycleSignals;
    risk?: RiskSignals;
    quality?: QualitySignals;
}

export interface ContextSynthesis {
    stability: number;
    confidence: number;
    aiRisk: ContextRiskLevel;
    coverage: ContextCoverageLevel;
    story: string;
    stories: string[];
}

export interface ContextFingerprintAxes {
    files: number;
    requirements: number;
    history: number;
    architecture: number;
    git: number;
    diagnostics: number;
    coverage: number;
}

export interface AiReadiness {
    score: number;
    ready: boolean;
    checks: { label: string; ok: boolean }[];
    risk: ContextRiskLevel;
}

export interface FocusSignalInput {
    focusIdeaId?: string;
    status?: string;
    parentCount: number;
    inboundCount: number;
    outboundCount: number;
    unresolvedCount: number;
    createdAt?: string;
    modifiedAt?: string;
    now?: Date;
}

export function emptyContextSignals(): ContextSignals {
    return {};
}

export function emptyContextSynthesis(): ContextSynthesis {
    return {
        stability: 0.5,
        confidence: 0.3,
        aiRisk: 'medium',
        coverage: 'unknown',
        story: 'Insufficient evidence',
        stories: ['Insufficient evidence']
    };
}

function parseIsoDate(value?: string): Date | undefined {
    if (!value) {
        return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

function wholeDaysBetween(later: Date, earlier: Date): number {
    const ms = later.getTime() - earlier.getTime();
    return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export function buildFocusSignals(input: FocusSignalInput): ContextSignals {
    if (!input.focusIdeaId) {
        return emptyContextSignals();
    }

    const now = input.now ?? new Date();
    const created = parseIsoDate(input.createdAt);
    const modified = parseIsoDate(input.modifiedAt);
    const ageDays = created ? wholeDaysBetween(now, created) : undefined;
    const timeSinceTouchedDays = modified
        ? wholeDaysBetween(now, modified)
        : created
            ? wholeDaysBetween(now, created)
            : undefined;

    const dependentCount = Math.max(0, input.inboundCount - input.parentCount);
    const highFanout = input.inboundCount >= 8 || input.outboundCount >= 12;
    const unresolvedRefs = input.unresolvedCount > 0;
    const recentlyTouched =
        timeSinceTouchedDays !== undefined ? timeSinceTouchedDays <= 14 : false;

    const flags: string[] = [];
    if (highFanout) {
        flags.push('high_fanout');
    }
    if (unresolvedRefs) {
        flags.push('unresolved_refs');
    }
    if (recentlyTouched) {
        flags.push('recently_touched');
    }

    return {
        focusIdeaId: input.focusIdeaId,
        relationship: {
            parentCount: input.parentCount,
            childCount: input.outboundCount,
            inboundCount: input.inboundCount,
            outboundCount: input.outboundCount,
            dependentCount
        },
        developmentHistory: {
            createdAt: input.createdAt,
            modifiedAt: input.modifiedAt,
            ageDays,
            timeSinceTouchedDays
        },
        lifecycle: {
            createdAt: input.createdAt,
            lastEditedAt: input.modifiedAt,
            status: input.status
        },
        risk: {
            highFanout,
            unresolvedRefs,
            recentlyTouched,
            flags
        },
        quality: {
            unresolvedCount: input.unresolvedCount,
            hasStatus: Boolean(input.status)
        }
    };
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

export function synthesizeFocusContext(signals: ContextSignals): ContextSynthesis {
    if (!signals.focusIdeaId) {
        return emptyContextSynthesis();
    }

    const rel = signals.relationship;
    const hist = signals.developmentHistory;
    const risk = signals.risk;
    const quality = signals.quality;

    const ageFactor =
        hist?.ageDays === undefined ? 0.5 : clamp01(Math.min(hist.ageDays, 365) / 365);
    const quietFactor =
        hist?.timeSinceTouchedDays === undefined
            ? 0.5
            : clamp01(Math.min(hist.timeSinceTouchedDays, 180) / 180);
    const fanoutPenalty = clamp01(((rel?.inboundCount ?? 0) + (rel?.outboundCount ?? 0)) / 30);
    const unresolvedPenalty = (quality?.unresolvedCount ?? 0) > 0 ? 0.2 : 0;

    const stability = clamp01(
        0.35 * ageFactor + 0.45 * quietFactor + 0.2 * (1 - fanoutPenalty) - unresolvedPenalty
    );

    let confidence = 0.25;
    if (quality?.hasStatus) {
        confidence += 0.2;
    }
    if (hist?.createdAt || hist?.modifiedAt) {
        confidence += 0.2;
    }
    if ((rel?.inboundCount ?? 0) + (rel?.outboundCount ?? 0) > 0) {
        confidence += 0.2;
    }
    if ((quality?.unresolvedCount ?? 0) === 0) {
        confidence += 0.15;
    }
    confidence = clamp01(confidence);

    let aiRisk: ContextRiskLevel = 'low';
    if (stability < 0.45 || (risk?.highFanout && risk.recentlyTouched)) {
        aiRisk = 'high';
    } else if (stability < 0.7 || risk?.highFanout || risk?.unresolvedRefs) {
        aiRisk = 'medium';
    }

    const coverage: ContextCoverageLevel =
        (rel?.outboundCount ?? 0) === 0 && (rel?.inboundCount ?? 0) === 0
            ? 'unknown'
            : (quality?.unresolvedCount ?? 0) > 0
                ? 'partial'
                : 'partial';

    const stories: string[] = [];
    if (stability >= 0.75) {
        stories.push('Very stable');
    } else if (stability >= 0.5) {
        stories.push('Moderately stable');
    } else {
        stories.push('Likely unstable');
    }
    if (hist?.timeSinceTouchedDays !== undefined) {
        if (hist.timeSinceTouchedDays === 0) {
            stories.push('Touched today');
        } else if (hist.timeSinceTouchedDays <= 14) {
            stories.push(`Edited ${hist.timeSinceTouchedDays}d ago`);
        } else {
            stories.push(`Quiet for ${hist.timeSinceTouchedDays}d`);
        }
    }
    if (risk?.highFanout) {
        stories.push('High dependency fanout');
    }
    if (risk?.unresolvedRefs) {
        stories.push('Unresolved references');
    }

    return {
        stability,
        confidence,
        aiRisk,
        coverage,
        story: stories.join(' · '),
        stories
    };
}

export function formatSynthesisMarkdown(synthesis: ContextSynthesis): string {
    const pct = (value: number) => `${Math.round(value * 100)}%`;
    return [
        '## Synthesis',
        `- Stability: ${pct(synthesis.stability)}`,
        `- Confidence: ${pct(synthesis.confidence)}`,
        `- AI risk: ${synthesis.aiRisk}`,
        `- Coverage: ${synthesis.coverage}`,
        `- ${synthesis.story}`
    ].join('\n');
}

export function buildContextFingerprint(input: {
    fileCount: number;
    ideaCount: number;
    historyCount: number;
    hasArchitectureHint: boolean;
    gitChangeCount: number;
    anomalyCount: number;
    coverage: ContextCoverageLevel;
}): ContextFingerprintAxes {
    const coverageScore =
        input.coverage === 'complete' ? 1 : input.coverage === 'partial' ? 0.55 : 0.15;
    return {
        files: clamp01(input.fileCount / 12),
        requirements: clamp01(input.ideaCount / 12),
        history: clamp01(input.historyCount / 12),
        architecture: input.hasArchitectureHint ? 0.7 : 0.2,
        git: clamp01(input.gitChangeCount / 8),
        diagnostics: clamp01(1 - input.anomalyCount / 5),
        coverage: coverageScore
    };
}

export function buildAiReadiness(
    signals: ContextSignals,
    synthesis: ContextSynthesis
): AiReadiness {
    const checks = [
        { label: 'Requirements', ok: Boolean(signals.focusIdeaId) },
        {
            label: 'Relationships',
            ok: ((signals.relationship?.inboundCount ?? 0) +
                (signals.relationship?.outboundCount ?? 0)) > 0
        },
        {
            label: 'History',
            ok: Boolean(
                signals.developmentHistory?.createdAt || signals.developmentHistory?.modifiedAt
            )
        },
        {
            label: 'Quality',
            ok: (signals.quality?.unresolvedCount ?? 0) === 0
        },
        { label: 'Risk', ok: synthesis.aiRisk !== 'high' }
    ];
    const okCount = checks.filter(check => check.ok).length;
    const score = clamp01(okCount / checks.length);
    return {
        score,
        ready: score >= 0.6 && synthesis.aiRisk !== 'high',
        checks,
        risk: synthesis.aiRisk
    };
}

export function formatFingerprintMarkdown(axes: ContextFingerprintAxes): string {
    const bar = (value: number) => {
        const filled = Math.round(value * 10);
        return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
    };
    return [
        '## Context fingerprint',
        `- Files ${bar(axes.files)}`,
        `- Requirements ${bar(axes.requirements)}`,
        `- History ${bar(axes.history)}`,
        `- Architecture ${bar(axes.architecture)}`,
        `- Git ${bar(axes.git)}`,
        `- Diagnostics ${bar(axes.diagnostics)}`,
        `- Coverage ${bar(axes.coverage)}`
    ].join('\n');
}

export function formatAiReadinessMarkdown(readiness: AiReadiness): string {
    const pct = `${Math.round(readiness.score * 100)}%`;
    return [
        '## AI readiness',
        `- Score: ${pct} (${readiness.ready ? 'ready' : 'not ready'})`,
        `- Risk: ${readiness.risk}`,
        ...readiness.checks.map(check => `- ${check.ok ? '✓' : '✕'} ${check.label}`)
    ].join('\n');
}

export function hotspotBandFromRisk(risk: ContextRiskLevel): ContextHotspotBand {
    return risk;
}

export function hotspotBorderWidth(band?: ContextHotspotBand): number {
    switch (band) {
        case 'high':
            return 5;
        case 'medium':
            return 3;
        case 'low':
            return 2;
        default:
            return 2;
    }
}

export function hotspotBorderColor(band?: ContextHotspotBand): string {
    switch (band) {
        case 'high':
            return '#f14c4c';
        case 'medium':
            return '#cca700';
        case 'low':
            return '#89d185';
        default:
            return '#3c3c3c';
    }
}

/** Opacity for impact-radius fade: selected = 1, 1 hop = 0.75, 2 hops = 0.45, farther = 0.2. */
export function impactOpacityForHopDistance(distance: number | undefined): number {
    if (distance === undefined) {
        return 0.2;
    }
    if (distance <= 0) {
        return 1;
    }
    if (distance === 1) {
        return 0.75;
    }
    if (distance === 2) {
        return 0.45;
    }
    return 0.2;
}

/** BFS hop distances from a center over undirected edges. */
export function hopDistancesFromCenter(
    centerId: string,
    edges: { sourceId: string; targetId: string }[]
): Map<string, number> {
    const adjacency = new Map<string, Set<string>>();
    for (const edge of edges) {
        if (!adjacency.has(edge.sourceId)) {
            adjacency.set(edge.sourceId, new Set());
        }
        if (!adjacency.has(edge.targetId)) {
            adjacency.set(edge.targetId, new Set());
        }
        adjacency.get(edge.sourceId)!.add(edge.targetId);
        adjacency.get(edge.targetId)!.add(edge.sourceId);
    }

    const distances = new Map<string, number>();
    const queue: string[] = [centerId];
    distances.set(centerId, 0);
    while (queue.length > 0) {
        const current = queue.shift()!;
        const nextDist = (distances.get(current) ?? 0) + 1;
        for (const neighbour of adjacency.get(current) ?? []) {
            if (!distances.has(neighbour)) {
                distances.set(neighbour, nextDist);
                queue.push(neighbour);
            }
        }
    }
    return distances;
}

/** Thin requirement-card cue from ref counts (Ideas Summary rows). */
export function requirementCardCue(inboundCount: number, outboundCount: number): {
    stability: number;
    label: string;
} {
    const fanout = inboundCount + outboundCount;
    const stability = clamp01(1 - fanout / 24);
    const label =
        stability >= 0.75
            ? 'Stable'
            : stability >= 0.45
                ? 'Active'
                : 'High churn risk';
    return { stability, label };
}

/** Timeline milestones for the ribbon widget. */
export function timelineMilestones(signals: ContextSignals, now = new Date()): {
    id: string;
    label: string;
    at: Date;
}[] {
    const milestones: { id: string; label: string; at: Date }[] = [];
    const created = parseIsoDate(signals.developmentHistory?.createdAt);
    const modified = parseIsoDate(signals.developmentHistory?.modifiedAt);
    if (created) {
        milestones.push({ id: 'created', label: 'Created', at: created });
    }
    if (modified) {
        milestones.push({ id: 'modified', label: 'Last edit', at: modified });
    }
    milestones.push({ id: 'now', label: 'Now', at: now });
    return milestones.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Two-point churn intensity 0–1 for the thin heat bar. */
export function thinChurnIntensity(signals: ContextSignals): number {
    const days = signals.developmentHistory?.timeSinceTouchedDays;
    if (days === undefined) {
        return 0.15;
    }
    if (days <= 3) {
        return 0.95;
    }
    if (days <= 14) {
        return 0.65;
    }
    if (days <= 60) {
        return 0.35;
    }
    return 0.1;
}
