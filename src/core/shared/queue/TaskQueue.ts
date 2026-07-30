export interface Task {
  id: string;
  name: string;
  payload: Record<string, unknown>;
}

export interface ITaskQueue {
  enqueue(taskName: string, payload: Record<string, unknown>): Promise<void>;
  process(taskName: string, handler: (payload: Record<string, unknown>) => Promise<void>): void;
}

export class InMemoryTaskQueue implements ITaskQueue {
  private handlers: Map<string, (payload: Record<string, unknown>) => Promise<void>> = new Map();

  async enqueue(taskName: string, payload: Record<string, unknown>): Promise<void> {
    const handler = this.handlers.get(taskName);
    if (handler) {
      // Execute asynchronously without blocking caller
      setTimeout(async () => {
        try {
          await handler(payload);
        } catch (err) {
          console.error(`Task execution failed for ${taskName}:`, err);
        }
      }, 0);
    }
  }

  process(taskName: string, handler: (payload: Record<string, unknown>) => Promise<void>): void {
    this.handlers.set(taskName, handler);
  }
}

export const taskQueue = new InMemoryTaskQueue();
