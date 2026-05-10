// Returns the global default cwd used when the user creates a new
// session. Stub: returns the home directory. The future settings UI
// will replace this implementation with a DB read, leaving the IPC
// contract unchanged.

import os from "node:os";

export function getDefaultCwd(): string {
	return os.homedir();
}
