// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AssistantMessage } from "../../src/renderer/components/messages/AssistantMessage";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

describe("AssistantMessage", () => {
	it("labels assistant replies as MacPi", async () => {
		await act(async () =>
			root.render(
				React.createElement(AssistantMessage, {
					entry: {
						kind: "assistant-text",
						id: "assistant-1",
						text: "Hello! How can I help?",
						thinking: "",
						streaming: false,
					},
				}),
			),
		);

		expect(container.textContent).toContain("MacPi");
		expect(container.textContent).not.toContain("pi ·");
	});
});
