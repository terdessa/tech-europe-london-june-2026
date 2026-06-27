import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { CONFIG } from "./config";

// Injected into the meeting page BEFORE Meet's scripts run.
// Taps every inbound WebRTC audio track, mixes them, and records 4s WebM windows,
// handing each window's base64 to window.__flashAudio (exposed from Node).
const CAPTURE_SCRIPT = `
(() => {
  if (window.__flashCapInit) return; window.__flashCapInit = true;
  const Orig = window.RTCPeerConnection;
  if (!Orig) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const dest = ctx.createMediaStreamDestination();
  function add(stream){ try { stream.getAudioTracks().forEach(function(t){ ctx.createMediaStreamSource(new MediaStream([t])).connect(dest); }); } catch(e){} }
  function Patched(){ const pc = new Orig(...arguments); pc.addEventListener('track', function(e){ if (e.track && e.track.kind === 'audio') add(e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track])); }); return pc; }
  Patched.prototype = Orig.prototype;
  window.RTCPeerConnection = Patched;
  function toB64(u8){ let s=''; for (let i=0;i<u8.length;i+=0x8000){ s += String.fromCharCode.apply(null, u8.subarray(i, i+0x8000)); } return btoa(s); }
  window.__flashStartRec = async function(){
    try { if (ctx.state === 'suspended') await ctx.resume(); } catch(e){}
    function rec(){
      let mr; try { mr = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' }); } catch(e){ return; }
      const chunks = [];
      mr.ondataavailable = function(e){ if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = async function(){
        try { const buf = new Uint8Array(await new Blob(chunks, { type:'audio/webm' }).arrayBuffer()); if (buf.length > 2000 && window.__flashAudio) window.__flashAudio(toB64(buf)); } catch(e){}
        rec();
      };
      mr.start(); setTimeout(function(){ try { mr.stop(); } catch(e){} }, 4000);
    }
    rec();
  };
})();
`;

// Injected BEFORE Meet runs. Makes Flash's microphone a Web Audio destination we
// control, so window.__flashSpeak(base64Wav) plays TTS straight into the call.
const MIC_SCRIPT = `
(() => {
  if (window.__flashMicInit) return; window.__flashMicInit = true;
  const md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) return;
  const orig = md.getUserMedia.bind(md);
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const mic = ctx.createMediaStreamDestination();
  md.getUserMedia = async function(constraints){
    if (!constraints || !constraints.audio) return orig(constraints);
    const out = new MediaStream();
    mic.stream.getAudioTracks().forEach(function(t){ out.addTrack(t); });
    if (constraints.video){ try { (await orig({ video: constraints.video })).getVideoTracks().forEach(function(t){ out.addTrack(t); }); } catch(e){} }
    return out;
  };
  window.__flashSpeak = async function(b64){
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      const bin = atob(b64); const u8 = new Uint8Array(bin.length);
      for (let i=0;i<bin.length;i++) u8[i] = bin.charCodeAt(i);
      const buf = await ctx.decodeAudioData(u8.buffer);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(mic);            // -> into the meeting (Flash's mic)
      src.connect(ctx.destination); // -> bot's local speaker so you hear it too
      await new Promise(function(res){ src.onended = res; src.start(); });
    } catch(e){ console.warn('flashSpeak failed', e); }
  };
})();
`;

/**
 * Joins a Google Meet as a separate guest named "Flash" (NOT your account),
 * captures the meeting audio for STT, can post chat, and screenshot the tab.
 *
 * The browser is visible: you just **Admit "Flash"** when it asks to join.
 */
export class MeetBot {
  private browser?: Browser;
  private ctx?: BrowserContext;
  private page?: Page;
  private audioHandler?: (b64: string) => void;

  async join(meetUrl: string): Promise<void> {
    const args = [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--disable-blink-features=AutomationControlled",
    ];

    if (CONFIG.userDataDir && CONFIG.userDataDir.trim()) {
      // Persistent profile (use a DEDICATED Flash Google account here, not your own).
      this.ctx = await chromium.launchPersistentContext(CONFIG.userDataDir, { headless: false, viewport: null, args });
      this.page = this.ctx.pages()[0] ?? (await this.ctx.newPage());
    } else {
      // Ephemeral guest browser -> Flash is a separate participant.
      this.browser = await chromium.launch({ headless: false, args });
      this.ctx = await this.browser.newContext({ viewport: null });
      this.page = await this.ctx.newPage();
    }

    await this.ctx.exposeBinding("__flashAudio", (_src, b64: string) => this.audioHandler?.(b64));
    await this.ctx.addInitScript(CAPTURE_SCRIPT);
    await this.ctx.addInitScript(MIC_SCRIPT);

    const page = this.page;
    await page.goto(meetUrl, { waitUntil: "load", timeout: 60000 });

    // Guest name prompt.
    try {
      const nameInput = page.getByPlaceholder(/your name/i);
      if (await nameInput.isVisible({ timeout: 4000 })) await nameInput.fill(CONFIG.displayName);
    } catch {
      /* signed-in profile: no name prompt */
    }

    // Auto-join.
    for (const label of [/ask to join/i, /join now/i]) {
      try {
        const btn = page.getByRole("button", { name: label });
        if (await btn.isVisible({ timeout: 4000 })) {
          await btn.click();
          break;
        }
      } catch {
        /* try next */
      }
    }
    console.log(`[meet] "${CONFIG.displayName}" is asking to join — Admit it from your meeting.`);
  }

  /** Start capturing meeting audio; each ~4s WebM window's base64 goes to onChunk. */
  async startAudioCapture(onChunk: (b64: string) => void): Promise<void> {
    this.audioHandler = onChunk;
    try {
      await this.page?.evaluate("window.__flashStartRec && window.__flashStartRec()");
      console.log("[meet] audio capture started (SLNG STT)");
    } catch (err) {
      console.warn("[meet] could not start audio capture:", (err as Error).message);
    }
  }

  /** Speak a WAV into the meeting via Flash's (injected) microphone. */
  async speakInMeeting(wav: Buffer): Promise<void> {
    const page = this.page;
    if (!page) return;
    try {
      await this.ensureUnmuted();
      const b64 = wav.toString("base64");
      await page.evaluate((b: string) => (window as unknown as { __flashSpeak?: (s: string) => Promise<void> }).__flashSpeak?.(b), b64);
    } catch (err) {
      console.warn("[meet] speakInMeeting failed:", (err as Error).message);
    }
  }

  /** Best-effort: turn Flash's microphone on so the call can hear it. */
  async ensureUnmuted(): Promise<void> {
    const page = this.page;
    if (!page) return;
    try {
      const micOff = page.getByRole("button", { name: /turn on microphone/i });
      if (await micOff.isVisible({ timeout: 1500 })) await micOff.click();
    } catch {
      /* already on, or button not found */
    }
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
      console.warn("[meet] could not post chat");
    }
  }

  /** Best-effort: is someone presenting / sharing a screen right now? */
  async isPresenting(): Promise<boolean> {
    const page = this.page;
    if (!page) return false;
    try {
      return await page.evaluate(() => {
        if (document.querySelector('[aria-label*="presentation" i], [aria-label*="is presenting" i]')) return true;
        const t = document.body?.innerText ?? "";
        return /presenting to|is presenting|you are presenting|stop presenting/i.test(t);
      });
    } catch {
      return false;
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
    await this.ctx?.close();
    await this.browser?.close();
  }
}
