import './styles/global.css';
import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) {
    throw new Error('Missing #app mount point');
}

// Replace shell HTML placeholder so Svelte owns the content area.
target.replaceChildren();
mount(App, { target });
