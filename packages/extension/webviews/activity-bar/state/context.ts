import { getContext, setContext } from 'svelte';
import type { AppState } from './app.svelte.js';

const APP_KEY = Symbol('activity-bar-app');

export function setAppContext(app: AppState): void {
    setContext(APP_KEY, app);
}

export function getApp(): AppState {
    return getContext<AppState>(APP_KEY);
}
