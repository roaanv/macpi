// Reads skills via pi's DefaultResourceLoader applying our global
// `resourceEnabled` filter. Exposes list/read; later tasks add save,
// install, remove, import, reload.

import fs from "node:fs";
import path from "node:path";
import {
	getResourceEnabled,
	getResourceRoot,
} from "../shared/app-settings-keys";
import { skillResourceId } from "../shared/resource-id";
import type { SkillManifest, SkillSummary } from "../shared/skills-types";
import type { AppSettingsRepo } from "./repos/app-settings";

interface PiSkill {
	name: string;
	source?: { id?: string };
	filePath?: string;
}

export interface SkillsServiceDeps {
	appSettings: AppSettingsRepo;
	homeDir: string;
	loadSkills: () => Promise<PiSkill[]>;
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
		const source = skill.source?.id ?? "local";
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
}
