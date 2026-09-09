import { describe, it } from "mocha"
import "should"
import { OperationTimeoutError, TIMEOUTS, scaleTimeoutBySize, withTimeout, withTimeoutOrDefault } from "../async-timeout"

/** A promise that never settles, standing in for a hung editor/filesystem operation. */
function neverResolves<T>(): Promise<T> {
	return new Promise<T>(() => {})
}

const fastBudget = { slowAfterMs: 5, hardMs: 30 }

describe("withTimeout", () => {
	it("returns the value when the operation finishes in time", async () => {
		const result = await withTimeout(Promise.resolve("ok"), {
			label: "返回及时的操作",
			timeout: fastBudget,
		})

		result.should.equal("ok")
	})

	it("rethrows non-timeout errors unchanged", async () => {
		const failure = new Error("boom")
		let caught: unknown

		try {
			await withTimeout(Promise.reject(failure), {
				label: "会抛错的操作",
				timeout: fastBudget,
			})
		} catch (error) {
			caught = error
		}

		caught!.should.equal(failure)
	})

	it("throws OperationTimeoutError carrying the label, budget and detail", async () => {
		let caught: unknown

		try {
			await withTimeout(neverResolves(), {
				label: "写入文件",
				detail: "tools/patch.py",
				timeout: fastBudget,
			})
		} catch (error) {
			caught = error
		}

		caught!.should.be.instanceOf(OperationTimeoutError)
		const timeoutError = caught as OperationTimeoutError
		timeoutError.label.should.equal("写入文件")
		timeoutError.milliseconds.should.equal(fastBudget.hardMs)
		timeoutError.message.should.containEql("tools/patch.py")
	})
})

describe("withTimeoutOrDefault", () => {
	it("falls back instead of throwing when the operation hangs", async () => {
		const result = await withTimeoutOrDefault(neverResolves<string>(), "fallback", {
			label: "卡住的操作",
			timeout: fastBudget,
		})

		result.should.equal("fallback")
	})

	it("falls back when the operation rejects outright", async () => {
		const result = await withTimeoutOrDefault<string | undefined>(Promise.reject(new Error("boom")), undefined, {
			label: "抛错的操作",
			timeout: fastBudget,
		})

		;(result === undefined).should.be.true()
	})

	it("returns the real value when there is no timeout", async () => {
		const result = await withTimeoutOrDefault(Promise.resolve("ok"), "fallback", {
			label: "正常操作",
			timeout: fastBudget,
		})

		result.should.equal("ok")
	})
})

describe("scaleTimeoutBySize", () => {
	it("keeps the base budget when there is no payload", () => {
		scaleTimeoutBySize(TIMEOUTS.write).should.deepEqual(TIMEOUTS.write)
	})

	it("widens the budget for large payloads but honours the cap", () => {
		const scaled = scaleTimeoutBySize(TIMEOUTS.write, 1024 * 1024, 180_000)

		scaled.hardMs.should.be.above(TIMEOUTS.write.hardMs)
		scaled.hardMs.should.be.belowOrEqual(180_000)
		scaled.slowAfterMs.should.be.belowOrEqual(scaled.hardMs)
	})

	it("never drops below the base budget", () => {
		const scaled = scaleTimeoutBySize(TIMEOUTS.write, 10)

		scaled.hardMs.should.be.aboveOrEqual(TIMEOUTS.write.hardMs)
	})
})
