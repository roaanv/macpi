// Reads extensions via pi's DefaultResourceLoader applying our global
// `resourceEnabled` filter. Surfaces pi load errors. Exposes
// list/read/save/setEnabled/install/remove/lint.

import fs from "node:fs";
import path from "node:path";
import {
	getResourceEnabled,
	getResourceRoot,
} from "../shared/app-settings-keys";
import type {
	ExtensionDiagnostic,
	ExtensionLoadError,
	ExtensionManifest,
	ExtensionSummary,
} from "../shared/extensions-types";
import type { PiEvent } from "../shared/pi-events";
import { extensionResourceId } from "../shared/resource-id";
import type { AppSettingsRepo } from "./repos/app-settings";

interface PiExtension {
	path: string;
	resolvedPath: string;
	sourceInfo: { source: string };
}

interface PiExtensionsResult {
	extensions: PiExtension[];
	errors: ExtensionLoadError[];
}

export interface ExtensionsServiceDeps {
	appSettings: AppSettingsRepo;
	homeDir: string;
	loadExtensions: () => Promise<PiExtensionsResult>;
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
	runBiome: (filePath: string) => Promise<ExtensionDiagnostic[]>;
}

export class ExtensionsService {
	constructor(private readonly deps: ExtensionsServiceDeps) {}

	private extensionsRoot(): string {
		return path.join(
			getResourceRoot(this.deps.appSettings.getAll(), this.deps.homeDir),
			"extensions",
		);
	}

	private idFor(ext: PiExtension): {
		id: string;
		source: string;
		relativePath: string;
	} {
		const source = ext.sourceInfo.source;
		const relativePath = ext.resolvedPath
			? path.relative(this.extensionsRoot(), ext.resolvedPath)
			: ext.path;
		return {
			id: extensionResourceId({ source, relativePath }),
			source,
			relativePath,
		};
	}

	async list(): Promise<{
		extensions: ExtensionSummary[];
		loadErrors: ExtensionLoadError[];
	}> {
		const result = await this.deps.loadExtensions();
		const enabled = getResourceEnabled(this.deps.appSettings.getAll());
		const extensions = result.extensions.map((e) => {
			const ids = this.idFor(e);
			return {
				id: ids.id,
				name: ids.relativePath,
				source: ids.source,
				relativePath: ids.relativePath,
				enabled: enabled[ids.id] !== false,
			};
		});
		return { extensions, loadErrors: result.errors };
	}

	async read(
		id: string,
	): Promise<{ manifest: ExtensionManifest; body: string }> {
		const result = await this.deps.loadExtensions();
		const target = result.extensions.find((e) => this.idFor(e).id === id);
		if (!target) throw new Error(`extension not found: ${id}`);
		const ids = this.idFor(target);
		const body = target.resolvedPath
			? fs.readFileSync(target.resolvedPath, "utf8")
			: "";
		return {
			manifest: {
				name: ids.relativePath,
				source: ids.source,
				relativePath: ids.relativePath,
				path: target.resolvedPath,
			},
			body,
		};
	}

	async save(id: string, body: string): Promise<void> {
		const result = await this.deps.loadExtensions();
		const target = result.extensions.find((e) => this.idFor(e).id === id);
		if (!target?.resolvedPath) {
			throw new Error(`extension not found or has no file: ${id}`);
		}
		fs.writeFileSync(target.resolvedPath, body);
	}

	async setEnabled(id: string, enabled: boolean): Promise<void> {
		const current = getResourceEnabled(this.deps.appSettings.getAll());
		const next = { ...current, [id]: enabled };
		this.deps.appSettings.set("resourceEnabled", next);
	}
}
