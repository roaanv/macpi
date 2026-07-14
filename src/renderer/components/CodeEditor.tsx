// React wrapper around CodeMirror 6. Controlled by { value, onChange }.
// Mounts the EditorView once; subsequent value changes are dispatched as
// transactions so cursor / undo history survive across renders.
// Supports "markdown" and "typescript" language modes via the `language` prop.

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import React from "react";

interface CodeEditorProps {
	value: string;
	onChange: (next: string) => void;
	language: "markdown" | "typescript";
}

function codeEditorTheme(dark: boolean) {
	return EditorView.theme(
		{
			"&": { height: "100%" },
			".cm-scroller": {
				fontFamily: "var(--font-mono)",
				fontSize: "var(--font-size-code-block)",
				lineHeight: "1.5385",
			},
		},
		{ dark },
	);
}

export function CodeEditor({ value, onChange, language }: CodeEditorProps) {
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
		const langExtension =
			language === "typescript" ? javascript({ typescript: true }) : markdown();
		const themeCompartment = new Compartment();
		const view = new EditorView({
			state: EditorState.create({
				doc: value,
				extensions: [
					lineNumbers(),
					history(),
					langExtension,
					keymap.of([...defaultKeymap, ...historyKeymap]),
					themeCompartment.of(
						codeEditorTheme(
							document.documentElement.classList.contains("dark"),
						),
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
		const observer = new MutationObserver(() => {
			view.dispatch({
				effects: themeCompartment.reconfigure(
					codeEditorTheme(document.documentElement.classList.contains("dark")),
				),
			});
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		return () => {
			observer.disconnect();
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

	return <div ref={hostRef} className="flex-1 overflow-hidden type-code" />;
}
