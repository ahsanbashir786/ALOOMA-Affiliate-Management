// After a git pull:  npm run fresh
// Installs any new packages, applies new database changes, and clears the website's saved build (.next),
// which is the usual reason the page keeps refreshing or shows old screens after an update.
import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const run = (cmd, args) => {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) { console.error(`\nStopped: "${cmd} ${args.join(" ")}" did not finish. Send me the red text above.`); process.exit(r.status ?? 1); }
};

console.log("1/3  Clearing the saved build");
rmSync(".next", { recursive: true, force: true });
console.log("2/3  Installing packages");
run("npm", ["install"]);
console.log("3/3  Updating the database");
run("npm", ["run", "db:migrate"]);
console.log("\nDone. Now start the website again with:  npm run dev");
