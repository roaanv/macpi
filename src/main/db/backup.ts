// Single-slot backup. Copies macpi.db → macpi.db.bak on every successful
// startup *before* migrations run, so a bad migration can be undone by
// pointing the user at the .bak file from the recovery dialog.

import fs from "node:fs";

export function rotateBackup(dbFile: string): void {
	if (!fs.existsSync(dbFile)) return;
	fs.copyFileSync(dbFile, `${dbFile}.bak`);
}
