import assert from "node:assert/strict";
import test from "node:test";
import { loadFFmpeg } from "./loadFFmpeg.js";

for (const page of [
  "http://localhost:5173/",
  "https://example.github.io/silence-remover/",
  "https://example.github.io/silence-remover/mp4-silence-remover.html",
]) {
  test(`loads the worker beside ${page}`, async () => {
    let options;
    await loadFFmpeg({
      load: async (value) => { options = value; },
      terminate: () => assert.fail("Successful startup must not terminate"),
    }, { baseURL: page });
    assert.equal(options.classWorkerURL, new URL("./worker/worker.mjs", page).href);
  });
}

test("a stalled worker is terminated and rejects so export can be retried", async () => {
  let terminated = false;
  await assert.rejects(loadFFmpeg({
    load: () => new Promise(() => {}),
    terminate: () => { terminated = true; },
  }, { baseURL: "https://example.github.io/repo/", timeoutMs: 10 }), /could not start/);
  assert.equal(terminated, true);
});

test("startup errors are preserved and the worker is terminated", async () => {
  const failure = new Error("Failed to fetch the core");
  let terminated = false;
  await assert.rejects(loadFFmpeg({
    load: async () => { throw failure; },
    terminate: () => { terminated = true; },
  }, { baseURL: "https://example.github.io/repo/" }), failure);
  assert.equal(terminated, true);
});
