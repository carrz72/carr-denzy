/**
 * Starts the production server with the project directory as cwd.
 *
 * `next start <dir>` resolves <dir> RELATIVE to the current working directory,
 * so launching it from another drive produces paths like
 * `F:\C:\dev\carr-denzy\C:\dev\carr-denzy\.next\...` and every request 500s.
 * Setting cwd on the child process is the fix; passing the directory is not.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const nextBin = join(projectDir, "node_modules", "next", "dist", "bin", "next");
const port = process.env.PORT ?? "3100";

const child = spawn(process.execPath, [nextBin, "start", "-p", port], {
  cwd: projectDir,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
