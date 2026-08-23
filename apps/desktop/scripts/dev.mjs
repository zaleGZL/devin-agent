import { spawn } from "node:child_process";
import electronPath from "electron";
import { createServer } from "vite";

const host = "127.0.0.1";
const server = await createServer({
  server: {
    host,
    port: 5173,
  },
});

await server.listen();
server.printUrls();

const address = server.httpServer?.address();
if (!address || typeof address === "string") {
  await server.close();
  throw new Error("Vite did not expose a TCP address.");
}

const child = spawn(electronPath, ["."], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: `http://${host}:${address.port}`,
  },
  stdio: "inherit",
});

let stopping = false;
async function stop(signal) {
  if (stopping) return;
  stopping = true;
  if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  await server.close();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void stop(signal).finally(() => process.exit(128 + (signal === "SIGINT" ? 2 : 15)));
  });
}

child.once("error", async (error) => {
  console.error(error);
  await stop("SIGTERM");
  process.exitCode = 1;
});

child.once("exit", async (code, signal) => {
  await stop("SIGTERM");
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
