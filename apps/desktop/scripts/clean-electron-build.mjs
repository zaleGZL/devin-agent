import { rm } from "node:fs/promises";
import path from "node:path";

const target = path.resolve("dist-electron");
if (path.basename(target) !== "dist-electron") throw new Error("Refusing to clean an unexpected path");
await rm(target, { recursive: true, force: true });
