// Pure cwd resolution. Order: explicit override → channel cwd →
// global defaultCwd → homeDir. Empty strings count as "unset".

export interface CwdInputs {
	override: string | undefined;
	channelCwd: string | null;
	defaultCwd: string;
	homeDir: string;
}

export function resolveCwd(input: CwdInputs): string {
	if (input.override && input.override.length > 0) return input.override;
	if (input.channelCwd && input.channelCwd.length > 0) return input.channelCwd;
	if (input.defaultCwd.length > 0) return input.defaultCwd;
	return input.homeDir;
}
