// Skills appear in the popup only for discovery. Their dispatch is a
// no-op — the Composer leaves the input as plain text so pi's SDK
// parses /skill:<name> on its end. See SlashDispatcher.dispatch().
//
// Note: SkillSummary does NOT carry a description (only name, source,
// relativePath, enabled). We surface source as the secondary text so the
// user can distinguish skills with the same name from different packages.

import type { SkillSummary } from "../../shared/skills-types";
import type { SlashCommand } from "./types";

export function skillCommands(skills: SkillSummary[]): SlashCommand[] {
	return skills
		.filter((s) => s.enabled)
		.map((s) => ({
			name: `skill:${s.name}`,
			description: s.source,
			kind: "skill",
			availableDuringStream: true,
		}));
}
