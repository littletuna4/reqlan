import { getContext, setContext } from 'svelte';
import type { AppState } from './app.svelte.js';

const APP_CONTEXT_KEY = Symbol('ideas-summary-app');

export function setAppContext(state: AppState): void {
    setContext(APP_CONTEXT_KEY, state);
}

export function getApp(): AppState {
    return getContext(APP_CONTEXT_KEY);
}
