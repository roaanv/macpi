// React wrapper around CodeMirror 6. Controlled by { value, onChange }.
// Mounts the EditorView once; subsequent value changes are dispatched as
// transactions so cursor / undo history survive across renders.

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import React from "react";

interface MarkdownEditorProps {
	value: string;
	onChange: (next: string) => void;
}

export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
	const hostRef = React.useRef<HTMLDivElement | null>(null);
	const viewRef = React.useRef<EditorView | null>(null);

	// Keep the latest onChange callable inside the update listener without
	// remounting the editor when the callback identity changes.
	const onChangeRef = React.useRef(onChange);
	React.useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	// Intentionally mount once; value sync happens in the next effect.
	// biome-ignore lint/correctness/useExhaustiveDependencies: mount-once intent
	React.useEffect(() => {
		if (!hostRef.current) return;
		const view = new EditorView({
			state: EditorState.create({
				doc: value,
				extensions: [
					lineNumbers(),
					history(),
					markdown(),
					keymap.of([...defaultKeymap, ...historyKeymap]),
					EditorView.theme(
						{
							"&": { height: "100%" },
							".cm-scroller": {
								fontFamily: "var(--font-family-mono, monospace)",
							},
						},
						{ dark: true },
					),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) {
							onChangeRef.current(update.state.doc.toString());
						}
					}),
				],
			}),
			parent: hostRef.current,
		});
		viewRef.current = view;
		return () => {
			view.destroy();
			viewRef.current = null;
		};
	}, []);

	// Sync external value changes when they differ from the editor's doc.
	React.useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const doc = view.state.doc.toString();
		if (doc !== value) {
			view.dispatch({ changes: { from: 0, to: doc.length, insert: value } });
		}
	}, [value]);

	return <div ref={hostRef} className="flex-1 overflow-hidden" />;
}
