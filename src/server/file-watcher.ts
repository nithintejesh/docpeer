import { watch } from "chokidar";

export function watchFile(
  filePath: string,
  onChange: (content: string) => void
) {
  const watcher = watch(filePath, {
    awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 },
    ignoreInitial: true,
  });

  watcher.on("change", async () => {
    const { readFileSync } = await import("fs");
    try {
      const content = readFileSync(filePath, "utf-8");
      onChange(content);
    } catch {}
  });

  return watcher;
}
