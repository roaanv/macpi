// IPC envelope used everywhere across renderer↔main and main↔pi-host boundaries.
// We never throw across the wire — every call returns ok() or err().

import type {
	ExtensionDiagnostic,
	ExtensionLoadError,
	ExtensionManifest,
	ExtensionSummary,
} from "./extensions-types";
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
	"session.reload": {
		req: { piSessionId: string };
		res: Record<string, never>;
	};
	"session.listForChannel": {
		req: { channelId: string };
		res: { piSessionIds: string[] };
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
	"resources.importFromPi": {
		req: Record<string, never>;
		res: {
			skills: { copied: number; skipped: number };
			extensions: { copied: number; skipped: number };
		};
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
}

export type IpcMethodName = keyof IpcMethods;
