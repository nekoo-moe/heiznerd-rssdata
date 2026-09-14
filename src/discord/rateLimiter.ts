import { logger } from "../utils/logger";

interface QueueTask<T> {
  task: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

export class DiscordMessageQueue {
  private queue: QueueTask<any>[] = [];
  private isProcessing: boolean = false;
  private delayMs: number;

  constructor(delayMs: number = 1500) {
    this.delayMs = delayMs;
  }

  public enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const current = this.queue.shift()!;

    try {
      const result = await current.task();
      current.resolve(result);
    } catch (error: any) {
      logger.error("Rate-limited task execution error:", error);
      // Handle Discord 429 Retry-After if present
      if (error?.status === 429 && error?.rawError?.retry_after) {
        const retryAfterMs = Math.ceil(error.rawError.retry_after * 1000) + 500;
        logger.warn(`Discord Rate Limit hit! Backing off for ${retryAfterMs}ms...`);
        await new Promise((r) => setTimeout(r, retryAfterMs));
      }
      current.reject(error);
    } finally {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      this.isProcessing = false;
      this.processNext();
    }
  }

  public get pendingCount(): number {
    return this.queue.length;
  }
}

export const discordQueue = new DiscordMessageQueue(1500);

