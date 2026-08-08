/**
 * Minimal VS Code webview theme tokens so production Svelte CSS renders outside the host.
 */
export const VSCODE_THEME_CSS = /* css */ `
:root {
  color-scheme: dark;
  --vscode-font-family: "Segoe UI", system-ui, sans-serif;
  --vscode-font-size: 13px;
  --vscode-foreground: #cccccc;
  --vscode-descriptionForeground: #9d9d9d;
  --vscode-disabledForeground: #666666;
  --vscode-errorForeground: #f48771;
  --vscode-sideBar-background: #1e1e1e;
  --vscode-sideBar-foreground: #cccccc;
  --vscode-sideBarSectionHeader-background: #1e1e1e;
  --vscode-sideBarSectionHeader-foreground: #cccccc;
  --vscode-sideBarSectionHeader-border: #2b2b2b;
  --vscode-panel-border: #2b2b2b;
  --vscode-editor-background: #1e1e1e;
  --vscode-editor-foreground: #d4d4d4;
  --vscode-editorWidget-background: #252526;
  --vscode-editorWidget-border: #454545;
  --vscode-input-background: #3c3c3c;
  --vscode-input-foreground: #cccccc;
  --vscode-input-border: #3c3c3c;
  --vscode-input-placeholderForeground: #8892a0;
  --vscode-button-background: #0e639c;
  --vscode-button-foreground: #ffffff;
  --vscode-button-hoverBackground: #1177bb;
  --vscode-button-secondaryBackground: #3a3d41;
  --vscode-button-secondaryForeground: #cccccc;
  --vscode-button-secondaryHoverBackground: #45494e;
  --vscode-list-hoverBackground: #2a2d2e;
  --vscode-list-activeSelectionBackground: #094771;
  --vscode-list-activeSelectionForeground: #ffffff;
  --vscode-list-inactiveSelectionBackground: #37373d;
  --vscode-focusBorder: #007fd4;
  --vscode-textLink-foreground: #3794ff;
  --vscode-textLink-activeForeground: #3794ff;
  --vscode-badge-background: #4d4d4d;
  --vscode-badge-foreground: #ffffff;
  --vscode-checkbox-background: #3c3c3c;
  --vscode-checkbox-border: #3c3c3c;
  --vscode-checkbox-foreground: #cccccc;
  --vscode-dropdown-background: #3c3c3c;
  --vscode-dropdown-foreground: #cccccc;
  --vscode-dropdown-border: #3c3c3c;
  --vscode-toolbar-hoverBackground: #2a2d2e;
  --vscode-icon-foreground: #c5c5c5;
  --vscode-scrollbarSlider-background: #79797966;
  --vscode-scrollbarSlider-hoverBackground: #646464b3;
  --vscode-widget-shadow: #00000066;
  --vscode-charts-green: #89d185;
  --vscode-charts-yellow: #f0c14a;
  --vscode-charts-red: #f48771;
  --vscode-charts-blue: #75beff;
}
html, body {
  margin: 0;
  padding: 0;
  background: var(--vscode-sideBar-background);
  color: var(--vscode-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
}
`;
