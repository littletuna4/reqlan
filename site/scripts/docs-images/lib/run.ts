import { spawnSync } from "node:child_process";

export function run(
  command: string,
  args: string[],
  cwd: string,
): void {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with status ${result.status ?? 1}`,
    );
  }
}
