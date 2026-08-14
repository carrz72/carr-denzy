/**
 * Starts the development server with the project directory as cwd.
 *
 * Same reason as start-preview.mjs: `next dev` resolves its directory relative
 * to the current working directory, so launching it from another drive builds
 * nonsense paths and every request 500s. Setting cwd on the child is the fix.
 *
 * Kept separate from the preview script because the two answer different
 * questions — the preview shows what users will get, the dev server shows the
 * unminified React warnings that production hides behind an error code.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const nextBin = join(projectDir, "node_modules", "next", "dist", "bin", "next");
const port = process.env.PORT ?? "3101";

const child = spawn(process.execPath, [nextBin, "dev", "-p", port], {
  cwd: projectDir,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
