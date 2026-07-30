import { EventEmitter } from "events";

export interface SystemEvent {
  eventName: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface IEventBus {
  publish(event: SystemEvent): Promise<void>;
  subscribe(eventName: string, handler: (event: SystemEvent) => Promise<void>): void;
}

export class InMemoryEventBus implements IEventBus {
  private emitter = new EventEmitter();

  async publish(event: SystemEvent): Promise<void> {
    this.emitter.emit(event.eventName, event);
  }

  subscribe(eventName: string, handler: (event: SystemEvent) => Promise<void>): void {
    this.emitter.on(eventName, async (event: SystemEvent) => {
      try {
        await handler(event);
      } catch (err) {
        console.error(`Error handling event ${eventName}:`, err);
      }
    });
  }
}

export const eventBus = new InMemoryEventBus();
