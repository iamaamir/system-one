import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SystemOneError,
  SystemOneHttpError,
  SystemOneProtocolError,
  SystemOneTimeoutError,
} from "../src/errors.ts";

describe("errors", () => {
  it("exposes machine-readable codes", () => {
    assert.equal(new SystemOneTimeoutError("slow").code, "SYSTEM_ONE_TIMEOUT");
    assert.equal(new SystemOneProtocolError("bad").code, "SYSTEM_ONE_PROTOCOL");
  });
  it("covers instanceof, cause chaining, and HttpError fields", () => {
    const timeout = new SystemOneTimeoutError("x");
    assert.ok(timeout instanceof Error);
    assert.ok(timeout instanceof SystemOneError);
    const root = new Error("root");
    const proto = new SystemOneProtocolError("p", { cause: root });
    assert.equal((proto.cause as Error).message, "root");
    const http = new SystemOneHttpError("h", {
      status: 429,
      provider: "t",
      requestId: "r1",
    });
    assert.equal(http.status, 429);
    assert.equal(http.provider, "t");
    assert.equal(http.requestId, "r1");
    assert.equal(http.code, "SYSTEM_ONE_HTTP");
  });
});
