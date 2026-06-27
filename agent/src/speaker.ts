import { CONFIG } from "./config";

/** Flash's "mouth". Swap ConsoleSpeaker -> SlngSpeaker at M1. */
export interface Speaker {
  speak(text: string): Promise<void>;
}

/** Stub: prints what Flash would say. Lets us test the flow before SLNG is wired. */
export class ConsoleSpeaker implements Speaker {
  async speak(text: string): Promise<void> {
    console.log(`\n[🔊 ${CONFIG.agentName} speaks]: ${text}\n`);
  }
}

// TODO (M1): SlngSpeaker
//   async speak(text) { call SLNG TTS with CONFIG.slngApiKey -> play audio into the meeting }
