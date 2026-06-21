import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PromptsService } from "../../src/main/prompts-service";

function makeAppSettings(initial: Record<string, unknown> = {}) {
	const settings = { ...initial };
	return {
		getAll: () => settings,
		set: (key: string, value: unknown) => {
			settings[key] = value;
		},
	};
}

describe("PromptsService", () => {
	let dir: string;
	let agentDir: string;

	beforeEach(() => {
		dir = mkdtempSync(path.join(os.tmpdir(), "macpi-prompts-"));
		agentDir = path.join(dir, "pi-agent");
		mkdirSync(path.join(agentDir, "prompts"), { recursive: true });
	});

	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	function makeService(opts: { enabled?: Record<string, boolean> }) {
		const appSettings = makeAppSettings(
			opts.enabled ? { resourceEnabled: opts.enabled } : {},
		);
		return new PromptsService({
			appSettings: appSettings as never,
			agentDir,
			loadPrompts: async () => [
				{
					name: "a",
					description: "A prompt",
					argumentHint: "<topic>",
					content: "body a",
					sourceInfo: { source: "local" },
					filePath: path.join(agentDir, "prompts", "a.md"),
				},
				{
					name: "b",
					description: "B prompt",
					content: "body b",
					sourceInfo: { source: "local" },
					filePath: path.join(agentDir, "prompts", "b.md"),
				},
			],
			loadPackageManager: async () => {
				throw new Error("not used in this test");
			},
			emitEvent: () => {},
		});
	}

	it("list computes IDs relative to the MacPi prompts root", async () => {
		const svc = makeService({ enabled: { "prompt:local:b.md": false } });
		const prompts = await svc.list();

		expect(prompts.map((p) => [p.id, p.relativePath, p.enabled])).toEqual([
			["prompt:local:a.md", "a.md", true],
			["prompt:local:b.md", "b.md", false],
		]);
	});

	it("read returns prompt metadata and content", async () => {
		const svc = makeService({});
		const detail = await svc.read("prompt:local:a.md");

		expect(detail.manifest).toMatchObject({
			name: "a",
			description: "A prompt",
			argumentHint: "<topic>",
			source: "local",
			relativePath: "a.md",
		});
		expect(detail.body).toBe("body a");
	});

	it("save writes frontmatter and body to the prompt file", async () => {
		writeFileSync(path.join(agentDir, "prompts", "a.md"), "old");
		const svc = makeService({});

		await svc.save("prompt:local:a.md", {
			description: "Updated",
			argumentHint: "<name>",
			body: "new body",
		});

		expect(readFileSync(path.join(agentDir, "prompts", "a.md"), "utf8")).toBe(
			'---\ndescription: "Updated"\nargument-hint: "<name>"\n---\n\nnew body\n',
		);
	});

	it("setEnabled persists flags by prompt ID", async () => {
		const svc = makeService({});

		await svc.setEnabled("prompt:local:a.md", false);

		expect(
			(await svc.list()).find((p) => p.id === "prompt:local:a.md")?.enabled,
		).toBe(false);
	});
});
