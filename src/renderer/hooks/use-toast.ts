// Tiny global toast registry. Single in-flight toast; new toasts replace
// the previous one. Auto-dismiss after 3 seconds. Backed by a module-
// level subscription set so any component can call useToast() without
// prop-drilling a provider.

import React from "react";

interface ToastState {
	message: string | null;
	id: number;
}

type Listener = (state: ToastState) => void;

const listeners = new Set<Listener>();
let current: ToastState = { message: null, id: 0 };
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function publish(state: ToastState) {
	current = state;
	for (const l of listeners) l(state);
}

export function showToast(message: string) {
	if (dismissTimer) clearTimeout(dismissTimer);
	publish({ message, id: current.id + 1 });
	dismissTimer = setTimeout(() => {
		publish({ message: null, id: current.id + 1 });
		dismissTimer = null;
	}, 3000);
}

export function dismissToast() {
	if (dismissTimer) {
		clearTimeout(dismissTimer);
		dismissTimer = null;
	}
	publish({ message: null, id: current.id + 1 });
}

/**
 * Test-only subscription. Exists because the project's test infra is
 * node-only (no RTL/jsdom), so we can't observe state through a rendered
 * component. Unit tests use this; production code uses useToast().
 */
export function subscribeForTests(l: Listener): () => void {
	listeners.add(l);
	return () => listeners.delete(l);
}

export function useToast() {
	const [state, setState] = React.useState<ToastState>(current);
	React.useEffect(() => {
		const l: Listener = (s) => setState(s);
		listeners.add(l);
		return () => {
			listeners.delete(l);
		};
	}, []);
	return { toast: state, showToast, dismissToast };
}
