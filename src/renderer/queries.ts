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
		mutationFn: (input: { name: string }) => invoke("channels.create", input),
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
		mutationFn: (input: { channelId: string; cwd: string }) =>
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
