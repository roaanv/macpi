// Reads prompts via pi's DefaultResourceLoader and surfaces a list keyed by
// our `resourceEnabled` map. Mirrors SkillsService, with description +
// argumentHint surfaced (unique to prompts) and frontmatter-aware save() so
// metadata edits round-trip into the on-disk markdown file's header.
//
// pi reads description from frontmatter `description` and argumentHint from
// `argument-hint` (see node_modules/.../prompt-templates.js:loadTemplateFromFile),
// so we serialize back to the same keys.

import fs from "node:fs";
import path from "node:path";
import {
	getResourceEnabled,
	getResourceRoot,
} from "../shared/app-settings-keys";
import type { PiEvent } from "../shared/pi-events";
import type { PromptManifest, PromptSummary } from "../shared/prompts-types";
import { promptResourceId } from "../shared/resource-id";
import type { AppSettingsRepo } from "./repos/app-settings";

interface PiPromptTemplate {
	name: string;
	description: string;
	argumentHint?: string;
	content: string;
	sourceInfo: { source: string };
	filePath: string;
}

export interface PromptsServiceDeps {
	appSettings: AppSettingsRepo;
	homeDir: string;
	loadPrompts: () => Promise<PiPromptTemplate[]>;
	loadPackageManager: () => Promise<{
		installAndPersist: (
			source: string,
			options?: { local?: boolean },
		) => Promise<void>;
		removeAndPersist: (
			source: string,
			options?: { local?: boolean },
		) => Promise<boolean>;
		setProgressCallback: (
			cb:
				| ((e: {
						type: string;
						action: string;
						source: string;
						message?: string;
				  }) => void)
				| undefined,
		) => void;
	}>;
	emitEvent: (e: PiEvent) => void;
}

export interface SavePromptInput {
	body: string;
	description?: string;
	argumentHint?: string;
}

export class PromptsService {
	constructor(private readonly deps: PromptsServiceDeps) {}

	private resourceRoot(): string {
		return getResourceRoot(this.deps.appSettings.getAll(), this.deps.homeDir);
	}

	private idFor(p: PiPromptTemplate): {
		id: string;
		source: string;
		relativePath: string;
	} {
		// Match SkillsService convention: relativePath is rooted at the
		// `prompts` subdir of the resource root, not the resource root itself.
		const source = p.sourceInfo.source;
		const promptsRoot = path.join(this.resourceRoot(), "prompts");
		const relativePath = p.filePath
			? path.relative(promptsRoot, p.filePath)
			: p.name;
		return {
			id: promptResourceId({ source, relativePath }),
			source,
			relativePath,
		};
	}

	async list(): Promise<PromptSummary[]> {
		const prompts = await this.deps.loadPrompts();
		const enabled = getResourceEnabled(this.deps.appSettings.getAll());
		return prompts.map((p) => {
			const ids = this.idFor(p);
			return {
				id: ids.id,
				name: p.name,
				description: p.description,
				argumentHint: p.argumentHint,
				source: ids.source,
				relativePath: ids.relativePath,
				enabled: enabled[ids.id] !== false,
			};
		});
	}

	async read(id: string): Promise<{ manifest: PromptManifest; body: string }> {
		const prompts = await this.deps.loadPrompts();
		const target = prompts.find((p) => this.idFor(p).id === id);
		if (!target) throw new Error(`prompt not found: ${id}`);
		const ids = this.idFor(target);
		return {
			manifest: {
				name: target.name,
				description: target.description,
				argumentHint: target.argumentHint,
				source: ids.source,
				relativePath: ids.relativePath,
			},
			body: target.content,
		};
	}

	async save(id: string, input: SavePromptInput): Promise<void> {
		const prompts = await this.deps.loadPrompts();
		const target = prompts.find((p) => this.idFor(p).id === id);
		if (!target?.filePath) {
			throw new Error(`prompt not found or has no file: ${id}`);
		}
		// description defaults to whatever's currently on disk; argumentHint can
		// be cleared explicitly by passing an empty string.
		const desc = input.description ?? target.description ?? "";
		const arg =
			input.argumentHint === undefined
				? target.argumentHint
				: input.argumentHint.length === 0
					? undefined
					: input.argumentHint;
		const merged = serializePromptFile(desc, arg, input.body);
		fs.writeFileSync(target.filePath, merged);
	}

	async setEnabled(id: string, enabled: boolean): Promise<void> {
		const current = getResourceEnabled(this.deps.appSettings.getAll());
		const next = { ...current, [id]: enabled };
		this.deps.appSettings.set("resourceEnabled", next);
	}

	async install(source: string): Promise<void> {
		const pm = await this.deps.loadPackageManager();
		pm.setProgressCallback((e) => {
			this.deps.emitEvent({
				type: "package.progress",
				action: e.action as "install" | "remove" | "update" | "clone" | "pull",
				source: e.source,
				phase: e.type as "start" | "progress" | "complete" | "error",
				message: e.message,
			});
		});
		try {
			await pm.installAndPersist(source, { local: false });
		} finally {
			pm.setProgressCallback(undefined);
		}
	}

	async remove(source: string): Promise<void> {
		const pm = await this.deps.loadPackageManager();
		await pm.removeAndPersist(source, { local: false });
	}
}

/**
 * Build a prompt-file string with frontmatter on top. Uses JSON-quoted
 * values (a strict subset of YAML strings) so descriptions or argument
 * hints containing colons, newlines, or quotes round-trip cleanly. Omits
 * the frontmatter block entirely when both fields are empty so we don't
 * decorate files that don't need it.
 */
export function serializePromptFile(
	description: string,
	argumentHint: string | undefined,
	body: string,
): string {
	const lines: string[] = [];
	if (description) lines.push(`description: ${JSON.stringify(description)}`);
	if (argumentHint && argumentHint.length > 0) {
		lines.push(`argument-hint: ${JSON.stringify(argumentHint)}`);
	}
	const trailing = body.endsWith("\n") ? body : `${body}\n`;
	if (lines.length === 0) return trailing;
	return `---\n${lines.join("\n")}\n---\n\n${trailing}`;
}
