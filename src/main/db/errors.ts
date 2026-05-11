// Typed errors thrown by the DB layer so the startup-recovery flow can
// distinguish between open failures, schema-version mismatch, and bad
// migrations — each maps to a different recovery action.

export class DbOpenError extends Error {
	readonly kind = "open" as const;
	constructor(
		message: string,
		public readonly cause?: unknown,
	) {
		super(message);
	}
}

export class DbSchemaNewerError extends Error {
	readonly kind = "schema-newer" as const;
	constructor(
		public readonly applied: number,
		public readonly known: number,
	) {
		super(
			`db schema version ${applied} is newer than this binary supports (${known}); update macpi.`,
		);
	}
}

export class DbMigrationError extends Error {
	readonly kind = "migration" as const;
	constructor(
		message: string,
		public readonly version: number,
		public readonly cause?: unknown,
	) {
		super(message);
	}
}
