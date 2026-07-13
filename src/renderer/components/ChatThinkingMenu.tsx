import React from "react";
import type { ThinkingLevel } from "../../shared/ipc-types";
import { useSetSessionThinkingLevel } from "../queries";

const LABELS: Record<ThinkingLevel, { short: string; full: string }> = {
	off: { short: "off", full: "Off" },
	minimal: { short: "min", full: "Minimal" },
	low: { short: "low", full: "Low" },
	medium: { short: "med", full: "Medium" },
	high: { short: "high", full: "High" },
	xhigh: { short: "xhigh", full: "XHigh" },
};

function errorMessage(error: unknown): string {
	return error instanceof Error
		? error.message
		: "Could not change thinking level";
}

export function ChatThinkingMenu({
	piSessionId,
	currentLevel,
	availableLevels,
	streaming,
}: {
	piSessionId: string;
	currentLevel: ThinkingLevel;
	availableLevels: ThinkingLevel[];
	streaming: boolean;
}) {
	const setThinking = useSetSessionThinkingLevel();
	const [open, setOpen] = React.useState(false);
	const [selecting, setSelecting] = React.useState(false);
	const [selectionError, setSelectionError] = React.useState<string | null>(
		null,
	);
	const wrapperRef = React.useRef<HTMLSpanElement>(null);
	const triggerRef = React.useRef<HTMLButtonElement>(null);
	const mountedRef = React.useRef(true);
	const focusFrameRef = React.useRef<number | null>(null);
	const restoreFocusRef = React.useRef(false);
	const pending = selecting || setThinking.isPending;

	const closeAndFocus = React.useCallback(() => {
		setOpen(false);
		triggerRef.current?.focus();
	}, []);

	React.useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			if (
				focusFrameRef.current !== null &&
				typeof cancelAnimationFrame === "function"
			) {
				cancelAnimationFrame(focusFrameRef.current);
			}
		};
	}, []);

	React.useEffect(() => {
		if (open || pending || !restoreFocusRef.current) return;
		restoreFocusRef.current = false;
		const focus = () => {
			focusFrameRef.current = null;
			if (mountedRef.current) triggerRef.current?.focus();
		};
		if (typeof requestAnimationFrame === "function") {
			focusFrameRef.current = requestAnimationFrame(focus);
		} else {
			queueMicrotask(focus);
		}
	}, [open, pending]);

	React.useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !pending) {
				event.preventDefault();
				closeAndFocus();
			}
		};
		const onPointerDown = (event: PointerEvent) => {
			if (!pending && !wrapperRef.current?.contains(event.target as Node))
				closeAndFocus();
		};
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("pointerdown", onPointerDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("pointerdown", onPointerDown);
		};
	}, [closeAndFocus, open, pending]);

	async function select(level: ThinkingLevel) {
		if (pending || streaming || level === currentLevel) return;
		setSelecting(true);
		setSelectionError(null);
		try {
			await setThinking.mutateAsync({ piSessionId, level });
			restoreFocusRef.current = true;
			setOpen(false);
		} catch (error) {
			setSelectionError(errorMessage(error));
		} finally {
			setSelecting(false);
		}
	}

	return (
		<span ref={wrapperRef} className="relative inline-flex">
			<button
				ref={triggerRef}
				type="button"
				aria-expanded={open}
				aria-haspopup="dialog"
				aria-label={`Thinking level: ${LABELS[currentLevel].full}`}
				disabled={streaming || pending}
				onClick={() => {
					if (streaming || pending) return;
					setSelectionError(null);
					setOpen((value) => !value);
				}}
				className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:surface-row disabled:cursor-not-allowed disabled:opacity-50"
				title="Thinking level"
			>
				<span aria-hidden>think:</span>
				<span className="font-medium">{LABELS[currentLevel].short}</span>
				<span aria-hidden className="text-faint">
					▾
				</span>
			</button>
			{open ? (
				<div
					role="dialog"
					aria-label="Choose thinking level"
					className="surface-panel absolute bottom-full left-0 z-50 mb-2 min-w-44 rounded border border-divider p-2 text-xs text-primary shadow-xl"
				>
					<div className="mb-1 px-2 py-1 font-semibold text-muted">
						Thinking level
					</div>
					<div role="listbox" aria-label="Supported thinking levels">
						{availableLevels.map((level) => {
							const current = level === currentLevel;
							return (
								<button
									key={level}
									type="button"
									role="option"
									aria-selected={current}
									disabled={pending}
									onClick={() => void select(level)}
									className="flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left hover:surface-row disabled:opacity-50"
								>
									<span>{LABELS[level].full}</span>
									{current ? (
										<span className="text-accent">Current</span>
									) : null}
								</button>
							);
						})}
					</div>
					{selectionError ? (
						<div role="alert" className="mt-2 text-err">
							{selectionError}
						</div>
					) : null}
				</div>
			) : null}
		</span>
	);
}
