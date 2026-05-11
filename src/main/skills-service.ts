// Reads skills via pi's DefaultResourceLoader applying our global
// `resourceEnabled` filter. Exposes list/read; later tasks add save,
// install, remove, import, reload.

import fs from "node:fs";
import path from "node:path";
import {
	getResourceEnabled,
	getResourceRoot,
} from "../shared/app-settings-keys";
import type { PiEvent } from "../shared/pi-events";
import { skillResourceId } from "../shared/resource-id";
import type { SkillManifest, SkillSummary } from "../shared/skills-types";
import type { AppSettingsRepo } from "./repos/app-settings";

interface PiSkill {
	name: string;
	sourceInfo: { source: string };
	filePath?: string;
}

export interface SkillsServiceDeps {
	appSettings: AppSettingsRepo;
	homeDir: string;
	loadSkills: () => Promise<PiSkill[]>;
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

export class SkillsService {
	constructor(private readonly deps: SkillsServiceDeps) {}

	private resourceRoot(): string {
		return getResourceRoot(this.deps.appSettings.getAll(), this.deps.homeDir);
	}

	private idFor(skill: PiSkill): {
		id: string;
		source: string;
		relativePath: string;
	} {
		// relativePath is computed against the skills *subdirectory* of the
		// resource root, not the resource root itself, so ids look like
		// `skill:local:my-skill.md` instead of `skill:local:skills/my-skill.md`.
		// Extensions and prompts services should mirror this (their own subdir).
		const source = skill.sourceInfo.source;
		const skillsRoot = path.join(this.resourceRoot(), "skills");
		const relativePath = skill.filePath
			? path.relative(skillsRoot, skill.filePath)
			: skill.name;
		return {
			id: skillResourceId({ source, relativePath }),
			source,
			relativePath,
		};
	}

	async list(): Promise<SkillSummary[]> {
		const skills = await this.deps.loadSkills();
		const enabled = getResourceEnabled(this.deps.appSettings.getAll());
		return skills.map((s) => {
			const ids = this.idFor(s);
			return {
				id: ids.id,
				name: s.name,
				source: ids.source,
				relativePath: ids.relativePath,
				enabled: enabled[ids.id] !== false,
			};
		});
	}

	async read(id: string): Promise<{ manifest: SkillManifest; body: string }> {
		const skills = await this.deps.loadSkills();
		const target = skills.find((s) => this.idFor(s).id === id);
		if (!target) throw new Error(`skill not found: ${id}`);
		const ids = this.idFor(target);
		const body = target.filePath
			? fs.readFileSync(target.filePath, "utf8")
			: "";
		return {
			manifest: {
				name: target.name,
				source: ids.source,
				relativePath: ids.relativePath,
			},
			body,
		};
	}

	async save(id: string, body: string): Promise<void> {
		const skills = await this.deps.loadSkills();
		const target = skills.find((s) => this.idFor(s).id === id);
		if (!target?.filePath) {
			throw new Error(`skill not found or has no file: ${id}`);
		}
		fs.writeFileSync(target.filePath, body);
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
