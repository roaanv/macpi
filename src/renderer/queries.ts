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
				: Promise.resolve({ piSessionIds: [] }),
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
