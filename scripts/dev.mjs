// Runs the API (with auto-restart) and the Vite dev server together. Ctrl+C stops both.
import { spawn } from "node:child_process";

const run = (name, args, color) => {
  const child = spawn(`npm ${args.join(" ")}`, { shell: true, stdio: ["inherit", "pipe", "pipe"] });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => stream.on("data", (d) => out.write(d.toString().replace(/^(?=.)/gm, tag)));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  return child;
};

const children = [run("api", ["run", "dev", "-w", "server"], 32), run("web", ["run", "dev", "-w", "client"], 36)];
const stop = () => { children.forEach((c) => c.kill()); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((c) => c.on("exit", (code) => { if (code) { console.error(`process exited with ${code}`); stop(); } }));
