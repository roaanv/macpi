// Pure cwd resolution. Order: explicit override → workspace cwd →
// global defaultCwd → homeDir. Empty strings count as "unset".

export interface CwdInputs {
	override: string | undefined;
	workspaceCwd: string | null;
	defaultCwd: string;
	homeDir: string;
}

export function resolveCwd(input: CwdInputs): string {
	if (input.override && input.override.length > 0) return input.override;
	if (input.workspaceCwd && input.workspaceCwd.length > 0)
		return input.workspaceCwd;
	if (input.defaultCwd.length > 0) return input.defaultCwd;
	return input.homeDir;
}
