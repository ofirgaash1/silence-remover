import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { errorMessage, guardFFmpeg } from "./guardFFmpeg.js";

function mockEngine(methods = {}) {
  return {
    terminated: false,
    on() {},
    terminate() { this.terminated = true; },
    ...methods,
  };
}

test("nonzero encoding exit codes reject and terminate the worker", async () => {
  const raw = mockEngine({ exec: async () => 1 });
  await assert.rejects(guardFFmpeg(raw).exec([]), /exit code 1/);
  assert.equal(raw.terminated, true);
});

test("successful commands and nonempty output are preserved", async () => {
  const output = new Uint8Array([1, 2, 3]);
  const raw = mockEngine({ exec: async () => 0, readFile: async () => output });
  const engine = guardFFmpeg(raw);
  assert.equal(await engine.exec([]), 0);
  assert.equal(await engine.readFile("output.mp4"), output);
  assert.equal(raw.terminated, false);
});

test("empty output and string rejections become readable errors", async () => {
  await assert.rejects(guardFFmpeg(mockEngine({
    readFile: async () => new Uint8Array(),
  })).readFile("output.mp4"), /empty output/);
  await assert.rejects(guardFFmpeg(mockEngine({
    writeFile: async () => { throw "Worker ran out of memory"; },
  })).writeFile("input.mp4", new Uint8Array()), /Worker ran out of memory/);
});

for (const operation of ["exec", "writeFile", "readFile", "deleteFile"]) {
  test(`a stalled ${operation} rejects and terminates`, async () => {
    const raw = mockEngine({ [operation]: () => new Promise(() => {}) });
    await assert.rejects(guardFFmpeg(raw, { timeoutMs: 10 })[operation](), /timed out/);
    assert.equal(raw.terminated, true);
  });
}

test("export failure remains on the page, releases workers, and allows retry", async () => {
  const script = await readFile(new URL("./script.js", import.meta.url), "utf8");
  const actionSource = script.slice(
    script.indexOf("async function runExportAction("),
    script.indexOf("async function buildSegmentsZipInBrowser("),
  );
  let state = "idle";
  const alerts = [];
  const engine = mockEngine();
  const context = vm.createContext({
    window: { uploadedFile: {} },
    title: { innerText: "Getting ready..." },
    console: { error() {} },
    alert: (message) => alerts.push(message),
    isExportRunning: () => state !== "idle",
    recomputeOrderedTimelineSegments() {},
    orderedTimelineSegments: [{ start: 0, end: 1, type: "noisy" }],
    setCurrentExportJob: (value) => { state = value; },
    EXPORT_JOB_STATE: { IDLE: "idle" },
    exportEngines: new Set([engine]),
    errorMessage,
  });
  vm.runInContext(actionSource, context);
  await context.runExportAction("mp4", async () => { throw "Network failed"; });
  assert.equal(context.title.innerText, "Export failed: Network failed");
  assert.deepEqual(alerts, ["Export failed: Network failed"]);
  assert.equal(engine.terminated, true);
  assert.equal(state, "idle");
  let retried = false;
  await context.runExportAction("mp4", async () => { retried = true; });
  assert.equal(retried, true);
});
