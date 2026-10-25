import { startApi, safeError } from "./server";
startApi().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
