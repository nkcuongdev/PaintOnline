/**
 * EventBus có kiểu: Engine phát sự kiện, engine-bridge lắng nghe và đẩy bản sao vào Zustand
 * (mục 4.2). Handler lỗi không làm hỏng các handler khác.
 */
export type Unsubscribe = () => void;

export class EventBus<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        (handler as (payload: Events[K]) => void)(payload);
      } catch (error) {
        console.error(`[EventBus] Lỗi trong handler "${String(event)}"`, error);
      }
    }
  }

  listenerCount(event: keyof Events): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  clear(): void {
    this.handlers.clear();
  }
}
