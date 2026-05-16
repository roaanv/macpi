// IPC envelope used everywhere across renderer↔main and main↔pi-host boundaries.
// We never throw across the wire — every call returns ok() or err().

import type { BranchTreeSnapshot } from "./branch-types";
import type {
	ExtensionDiagnostic,
	ExtensionLoadError,
	ExtensionManifest,
	ExtensionSummary,
} from "./extensions-types";
import type {
	ImportPiAuthModelsStatus,
	LocalOpenAIModelCandidate,
	LocalOpenAIProviderInput,
	ModelSummary,
	ModelsJsonReadResult,
	ProviderSummary,
	SelectedModelRef,
} from "./model-auth-types";
import type { NoteDetail, NoteSummary } from "./notes-types";
import type {
	PromptLoadError,
	PromptManifest,
	PromptSummary,
} from "./prompts-types";
import type { SkillManifest, SkillSummary } from "./skills-types";
import type { TimelineEntry } from "./timeline-types";

export type IpcResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: { code: string; message: string } };

export const ok = <T>(data: T): IpcResult<T> => ({ ok: true, data });
export const err = <T = never>(
	code: string,
	message: string,
): IpcResult<T> => ({
	ok: false,
	error: { code, message },
});

export const isOk = <T>(r: IpcResult<T>): r is { ok: true; data: T } => r.ok;
export const isErr = <T>(
	r: IpcResult<T>,
): r is { ok: false; error: { code: string; message: string } } => !r.ok;

// Method registry. Each entry maps method name → request/response shapes.
// Adding a method here is the only way to expose a new IPC call to the renderer.
// Lands progressively across this plan; entries are added when the corresponding
// handler is implemented (Tasks 9, 14, 18, 21, 26 of plan 1).
export interface IpcMethods {
	ping: { req: { value: string }; res: { value: string } };
	"channels.list": {
		req: Record<string, never>;
		res: {
			channels: {
				id: string;
				name: string;
				position: number;
				icon: string | null;
				cwd: string | null;
				createdAt: number;
			}[];
		};
	};
	"channels.create": {
		req: { name: string; icon?: string; cwd?: string | null };
		res: { id: string };
	};
	"channels.rename": {
		req: { id: string; name: string };
		res: Record<string, never>;
	};
	"channels.delete": {
		req: { id: string; force?: boolean };
		res: Record<string, never>;
	};
	"session.create": {
		req: { channelId: string; cwd?: string; label?: string };
		res: { piSessionId: string };
	};
	"session.prompt": {
		req: {
			piSessionId: string;
			text: string;
			/** Required when the session is streaming. "steer" interrupts; "followUp" queues. */
			streamingBehavior?: "steer" | "followUp";
		};
		res: Record<string, never>;
	};
	"session.clearQueue": {
		req: { piSessionId: string };
		/** Returns the cleared messages so the renderer can stash them as drafts if it wants. */
		res: { steering: string[]; followUp: string[] };
	};
	"session.removeFromQueue": {
		req: {
			piSessionId: string;
			queue: "steering" | "followUp";
			index: number;
		};
		res: Record<string, never>;
	};
	"session.abort": {
		req: { piSessionId: string };
		res: Record<string, never>;
	};
	"session.attach": {
		req: { piSessionId: string };
		/** History reconstructed from pi's persisted session log. */
		res: { entries: TimelineEntry[] };
	};
	"session.getHistory": {
		req: { piSessionId: string };
		/** Same shape as session.attach.res; used to refetch after branch navigation. */
		res: { entries: TimelineEntry[] };
	};
	"session.reload": {
		req: { piSessionId: string };
		res: Record<string, never>;
	};
	"session.listForChannel": {
		req: { channelId: string };
		res: {
			sessions: ReadonlyArray<{
				piSessionId: string;
				parentPiSessionId: string | null;
			}>;
		};
	};
	"session.rename": {
		req: { piSessionId: string; label: string };
		res: Record<string, never>;
	};
	"session.delete": {
		req: { piSessionId: string };
		res: Record<string, never>;
	};
	"session.setFirstMessageLabel": {
		req: { piSessionId: string; text: string };
		/** applied=true when the auto-label was written; false when the user has already set a label. */
		res: { applied: boolean };
	};
	"session.getMeta": {
		req: { piSessionId: string };
		res: {
			piSessionId: string;
			cwd: string | null;
			label: string | null;
		};
	};
	"session.findChannel": {
		req: { piSessionId: string };
		res: { channelId: string | null };
	};
	"settings.getAll": {
		req: Record<string, never>;
		res: { settings: Record<string, unknown> };
	};
	"settings.set": {
		req: { key: string; value: unknown };
		res: Record<string, never>;
	};
	"modelsAuth.listProviders": {
		req: Record<string, never>;
		res: { providers: ProviderSummary[] };
	};
	"modelsAuth.listModels": {
		req: Record<string, never>;
		res: { models: ModelSummary[]; registryError?: string };
	};
	"modelsAuth.getSelectedModel": {
		req: Record<string, never>;
		res: { model: SelectedModelRef | null; valid: boolean; error?: string };
	};
	"modelsAuth.setSelectedModel": {
		req: { model: SelectedModelRef | null };
		res: Record<string, never>;
	};
	"modelsAuth.saveApiKey": {
		req: { provider: string; apiKey: string };
		res: Record<string, never>;
	};
	"modelsAuth.logoutProvider": {
		req: { provider: string };
		res: Record<string, never>;
	};
	"modelsAuth.startOAuthLogin": {
		req: { provider: string };
		res: { loginId: string };
	};
	"modelsAuth.respondOAuthPrompt": {
		req: { loginId: string; promptId: string; value: string };
		res: Record<string, never>;
	};
	"modelsAuth.cancelOAuthLogin": {
		req: { loginId: string };
		res: Record<string, never>;
	};
	"modelsAuth.readModelsJson": {
		req: Record<string, never>;
		res: ModelsJsonReadResult;
	};
	"modelsAuth.writeModelsJson": {
		req: { text: string };
		res: { registryError?: string };
	};
	"modelsAuth.getImportStatus": {
		req: Record<string, never>;
		res: ImportPiAuthModelsStatus;
	};
	"modelsAuth.importFromPi": {
		req: { auth: boolean; models: boolean; replaceExisting: boolean };
		res: { copiedAuth: boolean; copiedModels: boolean };
	};
	"modelsAuth.listLocalOpenAIModels": {
		req: { baseUrl: string; apiKey: string };
		res: { models: LocalOpenAIModelCandidate[] };
	};
	"modelsAuth.saveLocalOpenAIProvider": {
		req: LocalOpenAIProviderInput;
		res: { provider: string; selectedModel: SelectedModelRef };
	};
	"dialog.openFolder": {
		req: { defaultPath?: string };
		/** path is null when the user cancelled the dialog. */
		res: { path: string | null };
	};
	"settings.getDefaultCwd": {
		req: Record<string, never>;
		res: { cwd: string };
	};
	"system.log": {
		req: {
			stream: "renderer";
			level: "info" | "warn" | "error";
			message: string;
		};
		res: Record<string, never>;
	};
	"system.openLogsFolder": {
		req: Record<string, never>;
		res: Record<string, never>;
	};
	"system.openExternalUrl": {
		req: { url: string };
		res: Record<string, never>;
	};
	"skills.list": {
		req: Record<string, never>;
		res: { skills: SkillSummary[] };
	};
	"skills.read": {
		req: { id: string };
		res: { manifest: SkillManifest; body: string };
	};
	"skills.save": {
		req: { id: string; body: string };
		res: Record<string, never>;
	};
	"skills.setEnabled": {
		req: { id: string; enabled: boolean };
		res: Record<string, never>;
	};
	"skills.install": {
		req: { source: string };
		res: Record<string, never>;
	};
	"skills.remove": {
		req: { source: string };
		res: Record<string, never>;
	};
	"prompts.list": {
		req: Record<string, never>;
		res: { prompts: PromptSummary[]; loadErrors: PromptLoadError[] };
	};
	"prompts.read": {
		req: { id: string };
		res: { manifest: PromptManifest; body: string };
	};
	"prompts.save": {
		req: {
			id: string;
			body: string;
			description?: string;
			argumentHint?: string;
		};
		res: Record<string, never>;
	};
	"prompts.setEnabled": {
		req: { id: string; enabled: boolean };
		res: Record<string, never>;
	};
	"prompts.install": {
		req: { source: string };
		res: Record<string, never>;
	};
	"prompts.remove": {
		req: { source: string };
		res: Record<string, never>;
	};
	"resources.listPiResources": {
		req: { kind: "skill" | "extension" | "prompt" };
		res: {
			resources: ReadonlyArray<{
				/** Identifier — filename (skill) or source string (extension). */
				name: string;
				/** Human-friendly name for display. */
				displayName: string;
				alreadyImported: boolean;
			}>;
		};
	};
	"resources.importPiResources": {
		req: {
			kind: "skill" | "extension" | "prompt";
			/** For skills: filenames. For extensions: source strings. */
			names: readonly string[];
		};
		res: { copied: number; skipped: number };
	};
	"extensions.list": {
		req: Record<string, never>;
		res: { extensions: ExtensionSummary[]; loadErrors: ExtensionLoadError[] };
	};
	"extensions.read": {
		req: { id: string };
		res: { manifest: ExtensionManifest; body: string };
	};
	"extensions.save": {
		req: { id: string; body: string };
		res: Record<string, never>;
	};
	"extensions.setEnabled": {
		req: { id: string; enabled: boolean };
		res: Record<string, never>;
	};
	"extensions.install": {
		req: { source: string };
		res: Record<string, never>;
	};
	"extensions.remove": {
		req: { source: string };
		res: Record<string, never>;
	};
	"extensions.lint": {
		req: { id: string };
		res: { diagnostics: ExtensionDiagnostic[] };
	};
	"session.getTree": {
		req: { piSessionId: string };
		res: BranchTreeSnapshot;
	};
	"session.navigateTree": {
		req: { piSessionId: string; entryId: string };
		res: Record<string, never>;
	};
	"session.fork": {
		req: { piSessionId: string; entryId: string; position?: "before" | "at" };
		res: { newSessionId: string };
	};
	"session.setEntryLabel": {
		req: { piSessionId: string; entryId: string; label: string };
		res: Record<string, never>;
	};
	"notes.list": {
		req: Record<string, never>;
		res: {
			notes: NoteSummary[];
			preamble: string;
			mtime: number;
		};
	};
	"notes.read": {
		req: { id: string };
		res: NoteDetail;
	};
	"notes.save": {
		req: { id: string; blob: string; force?: boolean };
		res:
			| { ok: true; mtime: number }
			| { ok: false; error: "stale"; currentMtime: number };
	};
	"notes.create": {
		req: Record<string, never>;
		res: { id: string };
	};
	"notes.delete": {
		req: { id: string; force?: boolean };
		res:
			| { ok: true; mtime: number }
			| { ok: false; error: "stale"; currentMtime: number };
	};
}

export type IpcMethodName = keyof IpcMethods;
