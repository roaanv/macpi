// TanStack Query hooks for all IPC calls exposed to the renderer.
// Mutations handle cache invalidation so callers don't need to.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";
import type { ThinkingLevel } from "../shared/ipc-types";
import { invoke, onPiEvent } from "./ipc";

/**
 * Subscribes to pi events for one session and invalidates `queryKey` whenever
 * the model finishes a turn (or compaction). Use this from any component that
 * shows derived session state that needs to refresh after each round-trip —
 * footer stats, context breakdown, token usage, etc.
 */
export function useInvalidateOnTurnEnd(
	piSessionId: string | null,
	queryKey: readonly unknown[],
) {
	const qc = useQueryClient();
	// biome-ignore lint/correctness/useExhaustiveDependencies: queryKey is array-stable per caller; consumers pass literal-shaped tuples
	React.useEffect(() => {
		if (!piSessionId) return;
		return onPiEvent((raw) => {
			if (!raw || typeof raw !== "object") return;
			const ev = raw as { type?: unknown; piSessionId?: unknown };
			if (ev.piSessionId !== piSessionId) return;
			if (
				ev.type === "session.turn_end" ||
				ev.type === "session.compaction_end"
			) {
				qc.invalidateQueries({ queryKey });
			}
		});
	}, [piSessionId, qc]);
}

export function useWorkspaces() {
	return useQuery({
		queryKey: ["workspaces"],
		queryFn: () => invoke("workspaces.list", {}),
	});
}

export function useCreateWorkspace() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { name: string; cwd?: string | null }) =>
			invoke("workspaces.create", input),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
	});
}

export function useSessionsForWorkspace(workspaceId: string | null) {
	return useQuery({
		queryKey: ["sessions", workspaceId],
		queryFn: () =>
			workspaceId
				? invoke("session.listForWorkspace", { workspaceId })
				: Promise.resolve({ sessions: [] as const }),
		enabled: !!workspaceId,
	});
}

export function useCreateSession() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			workspaceId: string;
			cwd?: string;
			label?: string;
		}) => invoke("session.create", input),
		onSuccess: (_data, vars) =>
			qc.invalidateQueries({ queryKey: ["sessions", vars.workspaceId] }),
	});
}

export function usePromptSession() {
	return useMutation({
		mutationFn: (input: {
			piSessionId: string;
			text: string;
			streamingBehavior?: "steer" | "followUp";
		}) => invoke("session.prompt", input),
	});
}

export function useClearQueue() {
	return useMutation({
		mutationFn: (input: { piSessionId: string }) =>
			invoke("session.clearQueue", input),
	});
}

export function useRemoveFromQueue() {
	return useMutation({
		mutationFn: (input: {
			piSessionId: string;
			queue: "steering" | "followUp";
			index: number;
		}) => invoke("session.removeFromQueue", input),
	});
}

export function useAbortSession() {
	return useMutation({
		mutationFn: (input: { piSessionId: string }) =>
			invoke("session.abort", input),
	});
}

export function useAttachSession(piSessionId: string | null) {
	return useQuery({
		queryKey: ["session.attach", piSessionId],
		queryFn: () =>
			piSessionId
				? invoke("session.attach", { piSessionId })
				: Promise.resolve({ entries: [] }),
		enabled: !!piSessionId,
		// Once we've attached, the renderer takes over via live PiEvents.
		// No need to refetch on focus or interval.
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
	});
}

export function useRenameWorkspace() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; name: string }) =>
			invoke("workspaces.rename", input),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
	});
}

export function useDeleteWorkspace() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; force?: boolean }) =>
			invoke("workspaces.delete", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["workspaces"] });
			qc.invalidateQueries({ queryKey: ["sessions"] });
		},
	});
}

export function useRenameSession() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { piSessionId: string; label: string }) =>
			invoke("session.rename", input),
		onSuccess: (_d, vars) => {
			qc.invalidateQueries({ queryKey: ["session.meta", vars.piSessionId] });
			qc.invalidateQueries({ queryKey: ["sessions"] });
		},
	});
}

export function useDeleteSession() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { piSessionId: string }) =>
			invoke("session.delete", input),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
	});
}

export function useSetFirstMessageLabel() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { piSessionId: string; text: string }) =>
			invoke("session.setFirstMessageLabel", input),
		onSuccess: (_d, vars) => {
			qc.invalidateQueries({ queryKey: ["session.meta", vars.piSessionId] });
			qc.invalidateQueries({ queryKey: ["sessions"] });
		},
	});
}

/**
 * Footer stats — current model, thinking level, and context usage. Cached
 * against the session id; renderers invalidate via the query key whenever a
 * turn ends so the context percentage jumps after each model response.
 */
export function useSessionFooterStats(piSessionId: string | null) {
	return useQuery({
		queryKey: ["session.footerStats", piSessionId],
		queryFn: () =>
			piSessionId
				? invoke("session.getFooterStats", { piSessionId })
				: Promise.resolve(null),
		enabled: !!piSessionId,
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
	});
}

export function useSetSessionModel() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			piSessionId: string;
			model: { provider: string; modelId: string };
		}) => invoke("session.setModel", input),
		onSuccess: (_data, input) =>
			qc.invalidateQueries({
				queryKey: ["session.footerStats", input.piSessionId],
			}),
	});
}

export function useSetSessionThinkingLevel() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { piSessionId: string; level: ThinkingLevel }) =>
			invoke("session.setThinkingLevel", input),
		onSuccess: (_data, input) =>
			qc.invalidateQueries({
				queryKey: ["session.footerStats", input.piSessionId],
			}),
	});
}

/**
 * Per-segment context breakdown + cumulative usage. Sibling of
 * useSessionFooterStats; invalidate together on turn_end / compaction_end.
 */
export function useSessionContextBreakdown(piSessionId: string | null) {
	return useQuery({
		queryKey: ["session.contextBreakdown", piSessionId],
		queryFn: () =>
			piSessionId
				? invoke("session.getContextBreakdown", { piSessionId })
				: Promise.resolve(null),
		enabled: !!piSessionId,
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
	});
}

export function useSessionMeta(piSessionId: string | null) {
	return useQuery({
		queryKey: ["session.meta", piSessionId],
		queryFn: () =>
			piSessionId
				? invoke("session.getMeta", { piSessionId })
				: Promise.resolve(null),
		enabled: !!piSessionId,
	});
}

/**
 * Lazily lists one folder's children under the session cwd. The query key
 * includes `showHidden` so toggling it doesn't share a cache with the
 * filtered list. Disabled when no session is selected.
 */
export function useDirListing(
	piSessionId: string | null,
	relPath: string,
	showHidden: boolean,
) {
	return useQuery({
		queryKey: ["files.listDir", piSessionId, relPath, showHidden],
		queryFn: () =>
			piSessionId
				? invoke("files.listDir", { piSessionId, relPath, showHidden })
				: Promise.resolve({ entries: [] }),
		enabled: !!piSessionId,
		staleTime: Number.POSITIVE_INFINITY,
	});
}

/**
 * Loads the content of one text file under the session cwd. Disabled when
 * either input is null. Refresh is owned by the calling component via
 * `useInvalidateOnTurnEnd`.
 */
export function useFileContent(
	piSessionId: string | null,
	relPath: string | null,
) {
	return useQuery({
		queryKey: ["files.readText", piSessionId, relPath],
		queryFn: () =>
			piSessionId && relPath
				? invoke("files.readText", { piSessionId, relPath })
				: Promise.resolve({ content: "", sizeBytes: 0 }),
		enabled: !!piSessionId && !!relPath,
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useSessionWorkspace(piSessionId: string | null) {
	return useQuery({
		queryKey: ["session.workspace", piSessionId],
		queryFn: () =>
			piSessionId
				? invoke("session.findWorkspace", { piSessionId })
				: Promise.resolve({ workspaceId: null }),
		enabled: !!piSessionId,
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useOpenFolder() {
	return useMutation({
		mutationFn: (input: { defaultPath?: string } = {}) =>
			invoke("dialog.openFolder", input),
	});
}

export function useDefaultCwd() {
	return useQuery({
		queryKey: ["settings.defaultCwd"],
		queryFn: () => invoke("settings.getDefaultCwd", {}),
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useSettings() {
	return useQuery({
		queryKey: ["settings"],
		queryFn: () => invoke("settings.getAll", {}),
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
	});
}

export function useSetSetting() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { key: string; value: unknown }) =>
			invoke("settings.set", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["settings"] });
			qc.invalidateQueries({ queryKey: ["settings.defaultCwd"] });
		},
	});
}

export function useModelAuthProviders() {
	return useQuery({
		queryKey: ["modelsAuth.providers"],
		queryFn: () => invoke("modelsAuth.listProviders", {}),
	});
}

export function useModelAuthModels() {
	return useQuery({
		queryKey: ["modelsAuth.models"],
		queryFn: () => invoke("modelsAuth.listModels", {}),
	});
}

export function useSelectedModel() {
	return useQuery({
		queryKey: ["modelsAuth.selectedModel"],
		queryFn: () => invoke("modelsAuth.getSelectedModel", {}),
	});
}

export function useSetSelectedModel() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			model: { provider: string; modelId: string } | null;
		}) => invoke("modelsAuth.setSelectedModel", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["modelsAuth.selectedModel"] });
			qc.invalidateQueries({ queryKey: ["settings"] });
		},
	});
}

export function useStartOAuthLogin() {
	return useMutation({
		mutationFn: (input: { provider: string }) =>
			invoke("modelsAuth.startOAuthLogin", input),
	});
}

export function useRespondOAuthPrompt() {
	return useMutation({
		mutationFn: (input: { loginId: string; promptId: string; value: string }) =>
			invoke("modelsAuth.respondOAuthPrompt", input),
	});
}

export function useCancelOAuthLogin() {
	return useMutation({
		mutationFn: (input: { loginId: string }) =>
			invoke("modelsAuth.cancelOAuthLogin", input),
	});
}

export function useSaveApiKey() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			provider: string;
			credential?:
				| { mode: "apiKey"; apiKey: string }
				| { mode: "keychainService"; service: string };
			apiKey?: string;
		}) =>
			invoke("modelsAuth.saveApiKey", {
				provider: input.provider,
				credential: input.credential ?? {
					mode: "apiKey",
					apiKey: input.apiKey ?? "",
				},
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["modelsAuth.providers"] });
			qc.invalidateQueries({ queryKey: ["modelsAuth.models"] });
		},
	});
}

export function useLogoutProvider() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { provider: string }) =>
			invoke("modelsAuth.logoutProvider", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["modelsAuth.providers"] });
			qc.invalidateQueries({ queryKey: ["modelsAuth.models"] });
		},
	});
}

export function useModelsJson() {
	return useQuery({
		queryKey: ["modelsAuth.modelsJson"],
		queryFn: () => invoke("modelsAuth.readModelsJson", {}),
	});
}

export function useSaveModelsJson() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { text: string }) =>
			invoke("modelsAuth.writeModelsJson", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["modelsAuth.modelsJson"] });
			qc.invalidateQueries({ queryKey: ["modelsAuth.providers"] });
			qc.invalidateQueries({ queryKey: ["modelsAuth.models"] });
		},
	});
}

export function useModelAuthImportStatus() {
	return useQuery({
		queryKey: ["modelsAuth.importStatus"],
		queryFn: () => invoke("modelsAuth.getImportStatus", {}),
	});
}

export function useImportPiAuthModels() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			auth: boolean;
			models: boolean;
			replaceExisting: boolean;
		}) => invoke("modelsAuth.importFromPi", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["modelsAuth.importStatus"] });
			qc.invalidateQueries({ queryKey: ["modelsAuth.providers"] });
			qc.invalidateQueries({ queryKey: ["modelsAuth.models"] });
			qc.invalidateQueries({ queryKey: ["modelsAuth.selectedModel"] });
		},
	});
}

export function useListCustomOpenAIModels() {
	return useMutation({
		mutationFn: (input: { baseUrl: string; apiKey: string }) =>
			invoke("modelsAuth.listCustomOpenAIModels", input),
	});
}

export function useSaveCustomOpenAIProvider() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			providerId: string;
			name: string;
			baseUrl: string;
			credential:
				| { mode: "apiKey"; apiKey: string }
				| { mode: "keychainService"; service: string };
			models: Array<{ id: string; name: string }>;
		}) => invoke("modelsAuth.saveCustomOpenAIProvider", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["modelsAuth.providers"] });
			qc.invalidateQueries({ queryKey: ["modelsAuth.models"] });
			qc.invalidateQueries({ queryKey: ["modelsAuth.modelsJson"] });
		},
	});
}
export function useRemoveCustomProvider() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { provider: string }) =>
			invoke("modelsAuth.removeCustomProvider", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["modelsAuth.providers"] });
			qc.invalidateQueries({ queryKey: ["modelsAuth.models"] });
			qc.invalidateQueries({ queryKey: ["modelsAuth.modelsJson"] });
			qc.invalidateQueries({ queryKey: ["modelsAuth.selectedModel"] });
			qc.invalidateQueries({ queryKey: ["settings"] });
		},
	});
}

function useInvalidateCustomModelsMutation<T>(
	mutationFn: (input: T) => Promise<unknown>,
) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["modelsAuth.providers"] });
			qc.invalidateQueries({ queryKey: ["modelsAuth.models"] });
			qc.invalidateQueries({ queryKey: ["settings"] });
		},
	});
}

export function useFetchCustomProviderModels() {
	return useInvalidateCustomModelsMutation((input: { provider: string }) =>
		invoke("modelsAuth.fetchCustomProviderModels", input),
	);
}

export function useSaveCustomModel() {
	return useInvalidateCustomModelsMutation(
		(input: { provider: string; model: { id: string; name: string } }) =>
			invoke("modelsAuth.saveCustomModel", input),
	);
}

export function useRemoveCustomModel() {
	return useInvalidateCustomModelsMutation(
		(input: { provider: string; modelId: string }) =>
			invoke("modelsAuth.removeCustomModel", input),
	);
}

export function useSkills() {
	return useQuery({
		queryKey: ["skills.list"],
		queryFn: () => invoke("skills.list", {}),
	});
}

export function useSetSkillEnabled() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; enabled: boolean }) =>
			invoke("skills.setEnabled", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["skills.list"] });
			window.dispatchEvent(new CustomEvent("macpi:skills-changed"));
		},
	});
}

export function useSkillDetail(id: string | null) {
	return useQuery({
		queryKey: ["skills.read", id],
		queryFn: () =>
			id ? invoke("skills.read", { id }) : Promise.reject(new Error("no id")),
		enabled: id !== null,
	});
}

export function useSaveSkill() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; body: string }) =>
			invoke("skills.save", input),
		onSuccess: (_d, vars) => {
			qc.invalidateQueries({ queryKey: ["skills.read", vars.id] });
			window.dispatchEvent(new CustomEvent("macpi:skills-changed"));
		},
	});
}

export function useInstallSkill() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { source: string }) => invoke("skills.install", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["skills.list"] });
			window.dispatchEvent(new CustomEvent("macpi:skills-changed"));
		},
	});
}

type ResourceKind = "skills" | "extensions" | "prompts";

const RESOURCE_REMOVE_METHOD = {
	skills: "skills.remove",
	extensions: "extensions.remove",
	prompts: "prompts.remove",
} as const satisfies Record<ResourceKind, string>;

const RESOURCE_CHANGE_EVENT = {
	skills: "macpi:skills-changed",
	extensions: "macpi:extensions-changed",
	prompts: "macpi:prompts-changed",
} as const satisfies Record<ResourceKind, string>;

/**
 * Generic remove-resource mutation. Invalidates both the list and any cached
 * detail queries (a removed id should never serve stale data on reinstall),
 * and broadcasts the well-known `macpi:<kind>-changed` event so the timeline
 * banner can prompt a session reload.
 */
function useRemoveResource(kind: ResourceKind) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { source: string }) =>
			invoke(RESOURCE_REMOVE_METHOD[kind], input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: [`${kind}.list`] });
			qc.removeQueries({ queryKey: [`${kind}.read`] });
			window.dispatchEvent(new CustomEvent(RESOURCE_CHANGE_EVENT[kind]));
		},
	});
}

export const useRemoveSkill = () => useRemoveResource("skills");

export function usePrompts() {
	return useQuery({
		queryKey: ["prompts.list"],
		queryFn: () => invoke("prompts.list", {}),
	});
}

export function useSetPromptEnabled() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; enabled: boolean }) =>
			invoke("prompts.setEnabled", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["prompts.list"] });
			window.dispatchEvent(new CustomEvent("macpi:prompts-changed"));
		},
	});
}

export function usePromptDetail(id: string | null) {
	return useQuery({
		queryKey: ["prompts.read", id],
		queryFn: () =>
			id ? invoke("prompts.read", { id }) : Promise.reject(new Error("no id")),
		enabled: id !== null,
	});
}

export function useSavePrompt() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			id: string;
			body: string;
			description?: string;
			argumentHint?: string;
		}) => invoke("prompts.save", input),
		onSuccess: (_d, vars) => {
			qc.invalidateQueries({ queryKey: ["prompts.read", vars.id] });
			qc.invalidateQueries({ queryKey: ["prompts.list"] });
			window.dispatchEvent(new CustomEvent("macpi:prompts-changed"));
		},
	});
}

export function useNotes() {
	return useQuery({
		queryKey: ["notes.list"],
		queryFn: () => invoke("notes.list", {}),
	});
}

export function useNoteDetail(id: string | null) {
	return useQuery({
		queryKey: ["notes.read", id],
		queryFn: () =>
			id ? invoke("notes.read", { id }) : Promise.reject(new Error("no id")),
		enabled: id !== null,
	});
}

export function useSaveNote() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; blob: string; force?: boolean }) =>
			invoke("notes.save", input),
		onSuccess: (_d, vars) => {
			qc.invalidateQueries({ queryKey: ["notes.list"] });
			qc.invalidateQueries({ queryKey: ["notes.read", vars.id] });
		},
	});
}

export function useCreateNote() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () => invoke("notes.create", {}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["notes.list"] });
		},
	});
}

export function useDeleteNote() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; force?: boolean }) =>
			invoke("notes.delete", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["notes.list"] });
		},
	});
}

export function useInstallPrompt() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { source: string }) => invoke("prompts.install", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["prompts.list"] });
			window.dispatchEvent(new CustomEvent("macpi:prompts-changed"));
		},
	});
}

export const useRemovePrompt = () => useRemoveResource("prompts");

export function useExtensions() {
	return useQuery({
		queryKey: ["extensions.list"],
		queryFn: () => invoke("extensions.list", {}),
	});
}

export function useSetExtensionEnabled() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; enabled: boolean }) =>
			invoke("extensions.setEnabled", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["extensions.list"] });
			window.dispatchEvent(new CustomEvent("macpi:extensions-changed"));
		},
	});
}

export function useInstallExtension() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { source: string }) =>
			invoke("extensions.install", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["extensions.list"] });
			window.dispatchEvent(new CustomEvent("macpi:extensions-changed"));
		},
	});
}

export const useRemoveExtension = () => useRemoveResource("extensions");

export function useReloadSession() {
	return useMutation({
		mutationFn: (input: { piSessionId: string }) =>
			invoke("session.reload", input),
		onSuccess: () => {
			window.dispatchEvent(new CustomEvent("macpi:skills-changed-cleared"));
		},
	});
}

export function useExtensionDetail(id: string | null) {
	return useQuery({
		queryKey: ["extensions.read", id],
		queryFn: () =>
			id
				? invoke("extensions.read", { id })
				: Promise.reject(new Error("no id")),
		enabled: id !== null,
	});
}

export function useSaveExtension() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; body: string }) =>
			invoke("extensions.save", input),
		onSuccess: (_d, vars) => {
			qc.invalidateQueries({ queryKey: ["extensions.read", vars.id] });
			window.dispatchEvent(new CustomEvent("macpi:extensions-changed"));
		},
	});
}

export function useLintExtension() {
	return useMutation({
		mutationFn: (input: { id: string }) => invoke("extensions.lint", input),
	});
}

export function useForkSession() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			piSessionId: string;
			entryId: string;
			position?: "before" | "at";
		}) => invoke("session.fork", input),
		onSuccess: () => {
			// The forked session needs to appear in the sidebar. Invalidate the
			// sessions query broadly.
			qc.invalidateQueries({ queryKey: ["sessions"] });
		},
	});
}
