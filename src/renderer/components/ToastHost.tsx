// Renders the current toast at the bottom-center of the viewport.
// Mounted once at the app root. Click-to-dismiss.

import { dismissToast, useToast } from "../hooks/use-toast";

export function ToastHost() {
	const { toast } = useToast();
	if (!toast.message) return null;
	// key={toast.id} forces React to remount the element on each new
	// toast, so a future enter animation (or auto-focus) restarts cleanly
	// when the message changes mid-flight rather than animating from a
	// stale prior state.
	return (
		<button
			key={toast.id}
			type="button"
			onClick={dismissToast}
			className="-translate-x-1/2 fixed bottom-6 left-1/2 z-50 rounded bg-black/80 px-4 py-2 text-sm text-white shadow-lg"
			aria-live="polite"
		>
			{toast.message}
		</button>
	);
}
