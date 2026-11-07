import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execCallback);

const command = String.raw`
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.rs" -o -name "*.svelte" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/generated/*" \
  -exec awk 'END {
    if (NR > 900) print FILENAME, "has", NR, "lines"
  }' {} \;
`;

try {
  const { stdout, stderr } = await exec(command);

  if (stdout.trim()) {
    console.log(stdout.trim());
  } else {
    console.log("No files exceed 900 lines.");
  }

  if (stderr.trim()) {
    console.error(stderr.trim());
  }
} catch (error) {
  console.error("File health check failed:", error.stderr || error.message);
  process.exitCode = error.code || 1;
}
