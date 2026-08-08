/** Shared demo payloads for docs webview captures. */

const FILTER_NOT_PRESENT = "__not_present__";

export const demoIdea = {
  id: "idea:welcome_flow",
  name: "welcome_flow",
  kind: "block" as const,
  fileUri: "file:///demo/reqs/product.rq",
  lineStart: 12,
  summary: "Empty submissions fail. Success continues into onboarding_checklist.",
  status: "done",
  statusKey: "done",
  tags: ["auth"],
  tagsKeys: ["auth"],
};

export const demoPasswordRules = {
  id: "idea:password_rules",
  name: "password_rules",
  kind: "block" as const,
  fileUri: "file:///demo/reqs/product.rq",
  lineStart: 28,
  summary: "Passwords must be at least twelve characters.",
  status: "done",
  statusKey: "done",
  tags: ["auth"],
  tagsKeys: ["auth"],
};

export const demoOnboarding = {
  id: "idea:onboarding_checklist",
  name: "onboarding_checklist",
  kind: "block" as const,
  fileUri: "file:///demo/reqs/product.rq",
  lineStart: 40,
  summary: "Post-login checklist for new accounts.",
  statusKey: FILTER_NOT_PRESENT,
  tags: [] as string[],
  tagsKeys: [FILTER_NOT_PRESENT],
};

export function demoIndexStatus() {
  return {
    state: "ready" as const,
    ready: true,
    ideaCount: 24,
    edgeCount: 41,
    fileIssueCount: 0,
    fileIssues: [] as unknown[],
    recentActivity: [
      { label: "Indexed", detail: "reqs/product.rq", at: Date.now() - 60_000 },
    ],
    activeBaseId: "base:demo",
    bases: [
      {
        id: "base:demo",
        label: "demo",
        root: "/demo",
        ready: true,
        ideaCount: 24,
        edgeCount: 41,
        fileIssueCount: 0,
        state: "ready" as const,
      },
    ],
  };
}

export function demoGraphSlice() {
  return {
    query: {
      centerId: demoIdea.id,
      includeIndirect: false,
      hopDepth: 1,
      maxNodes: 40,
    },
    centerId: demoIdea.id,
    depth: 1,
    truncated: false,
    totalMatching: 3,
    nodes: [
      {
        id: demoIdea.id,
        name: demoIdea.name,
        kind: "block",
        fileUri: demoIdea.fileUri,
        path: "reqs/product.rq",
        lineStart: demoIdea.lineStart,
        status: "done",
        statusKey: "done",
        tags: ["auth"],
        tagsKeys: ["auth"],
      },
      {
        id: demoPasswordRules.id,
        name: demoPasswordRules.name,
        kind: "block",
        fileUri: demoPasswordRules.fileUri,
        path: "reqs/product.rq",
        lineStart: demoPasswordRules.lineStart,
        status: "done",
        statusKey: "done",
        tags: ["auth"],
        tagsKeys: ["auth"],
      },
      {
        id: demoOnboarding.id,
        name: demoOnboarding.name,
        kind: "block",
        fileUri: demoOnboarding.fileUri,
        path: "reqs/product.rq",
        lineStart: demoOnboarding.lineStart,
        statusKey: FILTER_NOT_PRESENT,
        tags: [] as string[],
        tagsKeys: [FILTER_NOT_PRESENT],
      },
    ],
    edges: [
      {
        id: "e1",
        sourceId: demoIdea.id,
        targetId: demoPasswordRules.id,
        kind: "references",
        label: "password_rules",
      },
      {
        id: "e2",
        sourceId: demoIdea.id,
        targetId: demoOnboarding.id,
        kind: "references",
        label: "onboarding_checklist",
      },
    ],
  };
}

export function demoContextModel() {
  const focusIdea = { ...demoIdea, lineEnd: 26 };
  return {
    revision: 1,
    focus: {
      kind: "idea" as const,
      ideaId: demoIdea.id,
      fileUri: demoIdea.fileUri,
      line: demoIdea.lineStart,
    },
    dimensions: [
      {
        id: "workspace" as const,
        label: "Workspace",
        enabled: true,
        pinned: false,
        weight: 0.1,
        ideaCount: 24,
        fileCount: 6,
        summary: "24 ideas",
        hopDepth: 1,
        supportsHopControl: false,
      },
      {
        id: "current_file" as const,
        label: "This file",
        enabled: true,
        pinned: false,
        weight: 1,
        ideaCount: 3,
        fileCount: 1,
        summary: "product.rq",
        hopDepth: 1,
        supportsHopControl: true,
      },
    ],
    footprint: {
      ideaIds: [demoIdea.id, demoPasswordRules.id, demoOnboarding.id],
      fileUris: [demoIdea.fileUri],
      effectiveCenterId: demoIdea.id,
      summaryLine: "welcome_flow · 3 ideas",
      provenance: { ideaSources: {}, fileSources: {} },
    },
    globalHopDepth: 1,
    minHopDepth: 1,
    maxHopDepth: 4,
    dimensionHopDepth: {},
    currentFile: {
      fileUri: demoIdea.fileUri,
      fileLabel: "product.rq",
      isRqFile: true,
      focusIdea,
      ideasInFile: [
        focusIdea,
        { ...demoPasswordRules, lineEnd: 36 },
        { ...demoOnboarding, lineEnd: 48 },
      ],
      outline: [
        {
          id: demoIdea.id,
          name: demoIdea.name,
          lineStart: demoIdea.lineStart,
          lineEnd: 26,
          children: [],
        },
      ],
      unresolvedCount: 0,
      referencingIdeas: [],
      inboundReferencingIdeas: [],
      referencedIdeas: [demoPasswordRules, demoOnboarding],
      commentLinkedIdeas: [],
      folderReferencingIdeas: [],
    },
    openFiles: [
      {
        fileUri: demoIdea.fileUri,
        fileLabel: "product.rq",
        line: demoIdea.lineStart,
        sources: ["current_file" as const],
      },
    ],
    fileHistory: [],
    editHistory: [],
    manualIdeas: [],
    workspace: {
      ready: true,
      ideaCount: 24,
      edgeCount: 41,
      activeBaseId: "base:demo",
      activeBaseLabel: "demo",
      bases: [
        {
          id: "base:demo",
          label: "demo",
          root: "/demo",
          ready: true,
          ideaCount: 24,
          edgeCount: 41,
          fileIssueCount: 0,
        },
      ],
    },
    anomalies: [],
    references: {
      ideaId: demoIdea.id,
      rows: [
        {
          edgeId: "e1",
          direction: "outbound" as const,
          kind: "references" as const,
          label: "password_rules",
          targetName: "password_rules",
          targetPath: "reqs/product.rq",
          targetLine: demoPasswordRules.lineStart,
          isResolved: true,
          sourceIdeaId: demoIdea.id,
          targetIdeaId: demoPasswordRules.id,
        },
        {
          edgeId: "e2",
          direction: "outbound" as const,
          kind: "references" as const,
          label: "onboarding_checklist",
          targetName: "onboarding_checklist",
          targetPath: "reqs/product.rq",
          targetLine: demoOnboarding.lineStart,
          isResolved: true,
          sourceIdeaId: demoIdea.id,
          targetIdeaId: demoOnboarding.id,
        },
        {
          edgeId: "e3",
          direction: "inbound" as const,
          kind: "file_reference" as const,
          label: "login.ts",
          targetName: "login.ts",
          targetPath: "src/login.ts",
          isResolved: true,
          sourceIdeaId: "file:src/login.ts",
          targetIdeaId: demoIdea.id,
        },
      ],
    },
  };
}

export function demoIdeaSearchResults() {
  return {
    query: "password empty",
    total: 2,
    truncated: false,
    results: [
      {
        id: demoPasswordRules.id,
        name: demoPasswordRules.name,
        kind: "block",
        path: "reqs/product.rq",
        summary: demoPasswordRules.summary,
        fileUri: demoPasswordRules.fileUri,
        lineStart: demoPasswordRules.lineStart,
      },
      {
        id: demoIdea.id,
        name: demoIdea.name,
        kind: "block",
        path: "reqs/product.rq",
        summary: demoIdea.summary,
        fileUri: demoIdea.fileUri,
        lineStart: demoIdea.lineStart,
      },
    ],
  };
}

export function demoTodoList() {
  return {
    total: 1,
    truncated: false,
    results: [
      {
        id: demoOnboarding.id,
        name: demoOnboarding.name,
        kind: "block",
        path: "reqs/product.rq",
        summary: demoOnboarding.summary,
        fileUri: demoOnboarding.fileUri,
        lineStart: demoOnboarding.lineStart,
        todoNote: "Fill checklist steps",
      },
    ],
  };
}

export function demoAncestors() {
  return {
    ideaId: demoIdea.id,
    ancestors: [],
    statusRollup: { done: 1 },
    blocking: [],
  };
}

export function demoIdeasPage() {
  return {
    query: {
      page: 0,
      pageSize: 50,
      sortBy: "path",
      sortDir: "asc",
      attributeColumns: [] as string[],
      referenceFilters: [] as unknown[],
      columnFilters: [] as unknown[],
    },
    total: 3,
    rows: [
      {
        id: demoIdea.id,
        title: demoIdea.name,
        path: "reqs/product.rq",
        kind: "block" as const,
        mainAttribute: "status",
        otherAttributes: "tags",
        otherAttributeItems: ["tags"],
        attributeValues: { status: "done" },
        referenceCount: 2,
        outboundCount: 2,
        inboundCount: 1,
        outboundReferences: [],
        inboundReferences: [],
        fileUri: demoIdea.fileUri,
        lineStart: demoIdea.lineStart,
      },
      {
        id: demoPasswordRules.id,
        title: demoPasswordRules.name,
        path: "reqs/product.rq",
        kind: "block" as const,
        mainAttribute: "status",
        otherAttributes: "tags",
        otherAttributeItems: ["tags"],
        attributeValues: { status: "done" },
        referenceCount: 1,
        outboundCount: 0,
        inboundCount: 1,
        outboundReferences: [],
        inboundReferences: [],
        fileUri: demoPasswordRules.fileUri,
        lineStart: demoPasswordRules.lineStart,
      },
      {
        id: demoOnboarding.id,
        title: demoOnboarding.name,
        path: "reqs/product.rq",
        kind: "block" as const,
        otherAttributes: "",
        otherAttributeItems: [] as string[],
        attributeValues: {},
        referenceCount: 1,
        outboundCount: 0,
        inboundCount: 1,
        outboundReferences: [],
        inboundReferences: [],
        fileUri: demoOnboarding.fileUri,
        lineStart: demoOnboarding.lineStart,
      },
    ],
  };
}

export function demoOnboardingInit() {
  return {
    type: "init" as const,
    resources: [
      {
        id: "site",
        label: "Project site",
        href: "https://littletuna4.github.io/reqlan/",
      },
      {
        id: "quickstart",
        label: "Quickstart",
        href: "https://littletuna4.github.io/reqlan/quickstart/",
      },
      {
        id: "github",
        label: "GitHub",
        href: "https://github.com/littletuna4/reqlan",
      },
    ],
    templateValues: {
      SITE_URL: "https://littletuna4.github.io/reqlan/",
      QUICKSTART_URL: "https://littletuna4.github.io/reqlan/quickstart/",
      GITHUB_URL: "https://github.com/littletuna4/reqlan",
      VSC_URL: "https://marketplace.visualstudio.com/items?itemName=reqlan.reqlan",
      OPENVSX_URL: "https://open-vsx.org/extension/reqlan/reqlan",
    },
  };
}
