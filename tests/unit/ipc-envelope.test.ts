import { describe, expect, it } from "vitest";
import {
	err,
	type IpcResult,
	isErr,
	isOk,
	ok,
} from "../../src/shared/ipc-types";

describe("IPC envelope", () => {
	it("ok() builds a success envelope", () => {
		const r = ok({ x: 1 });
		expect(isOk(r)).toBe(true);
		expect(isErr(r)).toBe(false);
		if (isOk(r)) expect(r.data.x).toBe(1);
	});

	it("err() builds a failure envelope", () => {
		const r = err("not_found", "no such channel");
		expect(isErr(r)).toBe(true);
		expect(isOk(r)).toBe(false);
		if (isErr(r)) {
			expect(r.error.code).toBe("not_found");
			expect(r.error.message).toBe("no such channel");
		}
	});

	it("narrows correctly via the discriminated union", () => {
		const r: IpcResult<number> = Math.random() > 2 ? ok(1) : err("oops", "msg");
		if (isOk(r)) {
			const _x: number = r.data;
			expect(typeof _x).toBe("number");
		}
	});
});
