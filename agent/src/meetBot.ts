import { chromium, type BrowserContext, type Page } from "playwright";
import { CONFIG } from "./config";

export interface CaptionLine {
  speaker: string;
  text: string;
}

/**
 * Joins a Google Meet in a visible Chromium (persistent profile so you sign in once),
 * reads live captions (zero-key STT), posts chat, and screenshots the tab.
 *
 * NOTE: Google Meet's DOM is obfuscated and changes — selectors here are best-effort
 * with fallbacks. The browser is visible so you can click Join / turn on captions
 * manually if automation misses. The pipeline (wake-word, voice, context) works
 * regardless of how captions arrive.
 */
export class MeetBot {
  private ctx?: BrowserContext;
  private page?: Page;
  private pollTimer?: NodeJS.Timeout;

  async join(meetUrl: string): Promise<void> {
    this.ctx = await chromium.launchPersistentContext(CONFIG.userDataDir, {
      headless: false,
      viewport: null,
      args: [
        "--use-fake-ui-for-media-stream", // auto-accept mic/cam prompts
        "--disable-blink-features=AutomationControlled",
      ],
    });
    this.page = this.ctx.pages()[0] ?? (await this.ctx.newPage());
    const page = this.page;

    await page.goto(meetUrl, { waitUntil: "load", timeout: 60000 });

    // Best-effort: type a display name if this is a guest join.
    try {
      const nameInput = page.getByPlaceholder(/your name/i);
      if (await nameInput.isVisible({ timeout: 3000 })) await nameInput.fill(CONFIG.displayName);
    } catch {
      /* signed-in account: no name prompt */
    }

    // Best-effort: click join / ask to join.
    for (const label of [/join now/i, /ask to join/i]) {
      try {
        const btn = page.getByRole("button", { name: label });
        if (await btn.isVisible({ timeout: 3000 })) {
          await btn.click();
          break;
        }
      } catch {
        /* try next */
      }
    }

    console.log(
      "[meet] join attempted. If Flash isn't in yet: admit it from the meeting, " +
        "and turn on Captions (CC) so it can hear.",
    );
  }

  async enableCaptions(): Promise<void> {
    const page = this.page;
    if (!page) return;
    try {
      const cc = page.getByRole("button", { name: /captions|turn on captions|cc/i });
      if (await cc.isVisible({ timeout: 5000 })) {
        await cc.click();
        console.log("[meet] captions enabled");
      }
    } catch {
      console.log("[meet] could not auto-enable captions — please click CC manually.");
    }
  }

  /** Poll the captions region and emit each finalized line once. */
  startCaptions(onLine: (line: CaptionLine) => void): void {
    const page = this.page;
    if (!page) return;
    const seen = new Set<string>();

    this.pollTimer = setInterval(async () => {
      try {
        const blocks = await page.evaluate(() => {
          const el =
            (document.querySelector('[aria-label="Captions"]') as HTMLElement | null) ??
            (document.querySelector('[aria-label*="aption" i][role="region"]') as HTMLElement | null) ??
            (document.querySelector('[jsname][aria-live="polite"]') as HTMLElement | null);
          if (!el) return [];
          // Caption entries usually render as "<speaker>\n<text>".
          return el.innerText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        });

        // Emit lines that look stable. Skip the very last block (still being spoken).
        for (let i = 0; i < blocks.length - 1; i++) {
          const line = blocks[i];
          if (line.length < 2 || seen.has(line)) continue;
          seen.add(line);
          onLine({ speaker: "Participant", text: line });
        }
      } catch {
        /* page navigating / not ready */
      }
    }, 1500);
  }

  /** Post a message into the Meet chat (best-effort). */
  async postChat(text: string): Promise<void> {
    const page = this.page;
    if (!page) return;
    try {
      const openChat = page.getByRole("button", { name: /chat with everyone|open chat|chat/i });
      if (await openChat.isVisible({ timeout: 2000 })) await openChat.click();
      const input = page.getByPlaceholder(/send a message/i);
      await input.fill(`${CONFIG.agentName}: ${text}`);
      await input.press("Enter");
    } catch {
      console.warn("[meet] could not post chat (open the chat panel manually if needed)");
    }
  }

  /** Screenshot the meeting tab (captures a shared screen) as base64 JPEG. */
  async screenshot(): Promise<string | null> {
    const page = this.page;
    if (!page) return null;
    try {
      const buf = await page.screenshot({ type: "jpeg", quality: 60 });
      return buf.toString("base64");
    } catch {
      return null;
    }
  }

  async close(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    await this.ctx?.close();
  }
}
