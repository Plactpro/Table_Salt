import { EventEmitter } from "events";

type Handler = (msg: string) => void;

let publisher: import("ioredis").Redis | null = null;
let subscriber: import("ioredis").Redis | null = null;
let localEmitter: EventEmitter | null = null;

export function isRedisEnabled(): boolean {
  return !!process.env.REDIS_URL;
}

function getLocalEmitter(): EventEmitter {
  if (!localEmitter) {
    localEmitter = new EventEmitter();
    localEmitter.setMaxListeners(200);
  }
  return localEmitter;
}

function getPublisher(): import("ioredis").Redis {
  if (!publisher) {
    const Redis = require("ioredis");
    publisher = new Redis(process.env.REDIS_URL!, {
      lazyConnect: false,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });
    publisher.on("error", (err: Error) => {
      console.error("[pubsub] Redis publisher error:", err.message);
    });
  }
  return publisher!;
}

function getSubscriber(): import("ioredis").Redis {
  if (!subscriber) {
    const Redis = require("ioredis");
    subscriber = new Redis(process.env.REDIS_URL!, {
      lazyConnect: false,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });
    subscriber.on("error", (err: Error) => {
      console.error("[pubsub] Redis subscriber error:", err.message);
    });
  }
  return subscriber!;
}

export async function publish(channel: string, message: string): Promise<void> {
  if (isRedisEnabled()) {
    try {
      await getPublisher().publish(channel, message);
    } catch (err) {
      console.error("[pubsub] publish error:", err);
    }
  } else {
    getLocalEmitter().emit(channel, message);
  }
}

export async function subscribe(channel: string, handler: Handler): Promise<void> {
  if (isRedisEnabled()) {
    const sub = getSubscriber();
    sub.on("message", (ch: string, msg: string) => {
      if (ch === channel) handler(msg);
    });
    await sub.subscribe(channel);
  } else {
    getLocalEmitter().on(channel, handler);
  }
}

export async function psubscribe(pattern: string, handler: (channel: string, msg: string) => void): Promise<void> {
  if (isRedisEnabled()) {
    const sub = getSubscriber();
    sub.on("pmessage", (_pattern: string, channel: string, msg: string) => {
      handler(channel, msg);
    });
    await sub.psubscribe(pattern);
  } else {
    getLocalEmitter().on(pattern, (msg: string) => handler(pattern, msg));
  }
}
