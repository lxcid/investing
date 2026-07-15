import { execFile } from "node:child_process";
import { resolve, sep } from "node:path";
import type { Plugin, ViteDevServer } from "vite";

function buildResearchData(root: string): Promise<void> {
  return new Promise((resolveBuild, rejectBuild) => {
    execFile(
      process.execPath,
      [resolve(root, "scripts", "sync-research-data.mjs")],
      { cwd: root },
      (error, stdout, stderr) => {
        if (error) {
          rejectBuild(new Error(stderr.trim() || error.message));
          return;
        }
        if (stdout.trim()) process.stdout.write(stdout);
        resolveBuild();
      },
    );
  });
}

export function vaultDataWatch(): Plugin {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let building = false;
  let queued = false;

  return {
    name: "vault-data-watch",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      const root = server.config.root;
      const vaultRoot = resolve(root, "..", "..", "vault");
      const vaultPrefix = `${vaultRoot}${sep}`;

      const rebuild = async () => {
        if (building) {
          queued = true;
          return;
        }
        building = true;
        try {
          await buildResearchData(root);
          server.ws.send({ type: "full-reload" });
        } catch (error) {
          server.config.logger.error(
            error instanceof Error ? error.message : "Could not rebuild vault data.",
          );
        } finally {
          building = false;
          if (queued) {
            queued = false;
            void rebuild();
          }
        }
      };

      const onVaultChange = (_event: string, changedPath: string) => {
        const absolutePath = resolve(changedPath);
        if (absolutePath !== vaultRoot && !absolutePath.startsWith(vaultPrefix)) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void rebuild(), 120);
      };

      server.watcher.add(vaultRoot);
      server.watcher.on("all", onVaultChange);
      server.httpServer?.once("close", () => {
        if (timer) clearTimeout(timer);
        server.watcher.off("all", onVaultChange);
      });
    },
  };
}
