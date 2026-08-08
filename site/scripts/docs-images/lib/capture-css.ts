/** Shared capture CSS so webviews fill the viewport without stray scroll chrome. */
export const CAPTURE_BASE_CSS = /* css */ `
html, body {
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  background: var(--vscode-sideBar-background, #1e1e1e) !important;
}
#app {
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
}
* {
  scrollbar-width: none !important;
}
*::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}
`;

export const ACTIVITY_BAR_CAPTURE_CSS = /* css */ `
${CAPTURE_BASE_CSS}
.activity-bar {
  width: 100% !important;
  height: 100% !important;
  max-height: 100% !important;
  overflow: hidden !important;
}
.pane-stack {
  overflow: hidden !important;
}
/* Keep pane bodies usable — hide scrollbar chrome, but allow overflow. */
.section-body {
  overflow: auto !important;
  scrollbar-width: none !important;
}
.section-body::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}
.search-results {
  overflow: auto !important;
  scrollbar-width: none !important;
}
`;

/** Chat-search: hide collapsed chrome so the results list dominates. */
export const CHAT_SEARCH_CAPTURE_CSS = /* css */ `
${ACTIVITY_BAR_CAPTURE_CSS}
.section:has(.section-header [aria-expanded="false"]),
.section:has(button[aria-expanded="false"]) {
  /* keep headers so the shot still reads as activity-bar */
}
.section-fill .section-body {
  overflow: hidden !important;
}
.search-results {
  overflow: visible !important;
}
.search-results-list {
  overflow: visible !important;
}
`;

export const IDEAS_SUMMARY_CAPTURE_CSS = /* css */ `
${CAPTURE_BASE_CSS}
body {
  padding: 10px 12px !important;
  box-sizing: border-box !important;
  background: var(--vscode-editor-background, #1e1e1e) !important;
}
.graph-host, .cy-host, [data-graph-root] {
  overflow: hidden !important;
}
`;

export const ONBOARDING_CAPTURE_CSS = /* css */ `
${CAPTURE_BASE_CSS}
body {
  background: var(--vscode-editor-background, #1e1e1e) !important;
  overflow: auto !important;
}
main.onboarding {
  max-width: 100% !important;
  margin: 0 !important;
  padding: 12px 14px !important;
  gap: 0.75rem !important;
}
main.onboarding > header,
main.onboarding > section[aria-labelledby="resources-heading"] {
  display: none !important;
}
.rq-code {
  max-height: none !important;
  margin: 0 !important;
}
`;
