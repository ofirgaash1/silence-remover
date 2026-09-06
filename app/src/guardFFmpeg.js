const OPERATIONS = new Set(["exec", "writeFile", "readFile", "deleteFile"]);

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

// FFmpeg can return a failing exit code without rejecting, and a crashed worker
// can leave requests pending forever. Guard every operation used by exports.
export function guardFFmpeg(engine, { timeoutMs = 30 * 60 * 1000 } = {}) {
  const recentLogs = [];
  engine.on("log", ({ message }) => {
    recentLogs.push(message);
    if (recentLogs.length > 8) recentLogs.shift();
  });

  return new Proxy(engine, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (!OPERATIONS.has(property)) return value.bind(target);

      return async (...args) => {
        let timer;
        if (property === "exec") recentLogs.length = 0;
        try {
          const result = await Promise.race([
            value.apply(target, args),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error(
                `The export engine timed out during ${property}. Try a smaller file or use the desktop app.`
              )), timeoutMs);
            }),
          ]);
          if (property === "exec" && result !== 0) {
            throw new Error(`Encoding or merging failed (FFmpeg exit code ${result}).`);
          }
          if (property === "readFile" && !result?.length) {
            throw new Error("The export engine produced an empty output file.");
          }
          return result;
        } catch (error) {
          // Keep diagnostics in the console; the page gets a readable message.
          console.error(`FFmpeg ${property} failed`, error, recentLogs.join("\n"));
          target.terminate();
          throw new Error(errorMessage(error));
        } finally {
          clearTimeout(timer);
        }
      };
    },
  });
}
