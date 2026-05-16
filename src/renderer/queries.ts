// TanStack Query hooks for all IPC calls exposed to the renderer.
// Mutations handle cache invalidation so callers don't need to.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "./ipc";

export function useChannels() {
	return useQuery({
		queryKey: ["channels"],
		queryFn: () => invoke("channels.list", {}),
	});
}

export function useCreateChannel() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { name: string; cwd?: string | null }) =>
			invoke("channels.create", input),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
	});
}

export function useSessionsForChannel(channelId: string | null) {
	return useQuery({
		queryKey: ["sessions", channelId],
		queryFn: () =>
			channelId
				? invoke("session.listForChannel", { channelId })
				: Promise.resolve({ sessions: [] as const }),
		enabled: !!channelId,
	});
}

export function useCreateSession() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { channelId: string; cwd?: string; label?: string }) =>
			invoke("session.create", input),
		onSuccess: (_data, vars) =>
			qc.invalidateQueries({ queryKey: ["sessions", vars.channelId] }),
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

export function useRenameChannel() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; name: string }) =>
			invoke("channels.rename", input),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
	});
}

export function useDeleteChannel() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; force?: boolean }) =>
			invoke("channels.delete", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["channels"] });
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

export function useSessionChannel(piSessionId: string | null) {
	return useQuery({
		queryKey: ["session.channel", piSessionId],
		queryFn: () =>
			piSessionId
				? invoke("session.findChannel", { piSessionId })
				: Promise.resolve({ channelId: null }),
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
		mutationFn: (input: { provider: string; apiKey: string }) =>
			invoke("modelsAuth.saveApiKey", input),
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

export function useListLocalOpenAIModels() {
	return useMutation({
		mutationFn: (input: { baseUrl: string; apiKey: string }) =>
			invoke("modelsAuth.listLocalOpenAIModels", input),
	});
}

export function useSaveLocalOpenAIProvider() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			providerId: string;
			name: string;
			baseUrl: string;
			apiKey: string;
			models: Array<{ id: string; name: string }>;
			selectedModelId: string;
		}) => invoke("modelsAuth.saveLocalOpenAIProvider", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["modelsAuth.providers"] });
			qc.invalidateQueries({ queryKey: ["modelsAuth.models"] });
			qc.invalidateQueries({ queryKey: ["modelsAuth.modelsJson"] });
			qc.invalidateQueries({ queryKey: ["modelsAuth.selectedModel"] });
		},
	});
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

export function useRemoveSkill() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { source: string }) => invoke("skills.remove", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["skills.list"] });
			window.dispatchEvent(new CustomEvent("macpi:skills-changed"));
		},
	});
}

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

export function useRemovePrompt() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { source: string }) => invoke("prompts.remove", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["prompts.list"] });
			window.dispatchEvent(new CustomEvent("macpi:prompts-changed"));
		},
	});
}

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

export function useRemoveExtension() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { source: string }) =>
			invoke("extensions.remove", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["extensions.list"] });
			window.dispatchEvent(new CustomEvent("macpi:extensions-changed"));
		},
	});
}

export function usePiResources(
	kind: "skill" | "extension" | "prompt",
	enabled: boolean,
) {
	return useQuery({
		queryKey: ["resources.listPiResources", kind],
		queryFn: () => invoke("resources.listPiResources", { kind }),
		enabled,
		// Always refetch when reopening — the user may have installed pi
		// extensions externally between dialog openings.
		staleTime: 0,
	});
}

export function useImportPiResources() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			kind: "skill" | "extension" | "prompt";
			names: readonly string[];
		}) => invoke("resources.importPiResources", input),
		onSuccess: (_data, vars) => {
			if (vars.kind === "skill") {
				qc.invalidateQueries({ queryKey: ["skills.list"] });
				window.dispatchEvent(new CustomEvent("macpi:skills-changed"));
			} else {
				qc.invalidateQueries({ queryKey: ["extensions.list"] });
				window.dispatchEvent(new CustomEvent("macpi:extensions-changed"));
			}
			qc.invalidateQueries({
				queryKey: ["resources.listPiResources", vars.kind],
			});
		},
	});
}

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
