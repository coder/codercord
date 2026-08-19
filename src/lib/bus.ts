import { EventEmitter } from "node:events";

import type {
  HelpMessageContext,
  HelpThreadContext,
  HelpThreadStatusContext,
} from "@lib/discord/help.js";

// Enriched, domain-level events emitted by the help/issue-management flow.
// Consumers (e.g. the Linear bridge) subscribe here instead of re-deriving
// help-post state from raw Discord events.
type HelpEvents = {
  helpThreadCreated: [HelpThreadContext];
  helpMessagePosted: [HelpMessageContext];
  helpThreadStatusChanged: [HelpThreadStatusContext];
};

// Thin typed wrapper over Node's EventEmitter.
class TypedEmitter<Events extends Record<string, unknown[]>> {
  private readonly emitter = new EventEmitter();

  on<K extends keyof Events & string>(
    event: K,
    listener: (...args: Events[K]) => void,
  ): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  // Emits without letting a consumer error propagate into the help flow.
  emit<K extends keyof Events & string>(event: K, ...args: Events[K]): void {
    try {
      this.emitter.emit(event, ...args);
    } catch (err) {
      console.error(`Error in "${event}" handler:`, err);
    }
  }
}

export const bus = new TypedEmitter<HelpEvents>();
