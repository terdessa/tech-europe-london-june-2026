// One-time sign-in for Flash's Meet profile.
//
//   cd agent && npm run meet:login
//
// Opens Chromium with Flash's persistent profile (CONFIG.userDataDir) on the
// Google sign-in page. Sign in with the account Flash should use (a dedicated
// bot account is ideal), then CLOSE the window. The session is saved, so future
// joins go in as a signed-in user — anonymous guests get "You can't join this
// video call". Run this once (re-run only if the session expires).

import { chromium } from "playwright";
import { CONFIG } from "./config";

async function main(): Promise<void> {
  console.log(`[login] opening Flash profile at: ${CONFIG.userDataDir}`);
  const ctx = await chromium.launchPersistentContext(CONFIG.userDataDir, {
    headless: false,
    viewport: null,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto("https://accounts.google.com/", { waitUntil: "domcontentloaded" });
  console.log(
    "\n[login] Sign in with the Google account Flash should use, then CLOSE the window.\n" +
      "        (Tip: also open https://meet.google.com once to confirm you're in.)\n",
  );
  // Keep the process alive until the user closes the browser.
  await new Promise<void>((resolve) => ctx.on("close", () => resolve()));
  console.log("[login] profile saved. Flash will reuse this session to join meetings.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[login] failed:", (err as Error).message);
  process.exit(1);
});
