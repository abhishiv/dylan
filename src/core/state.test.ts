import { assert, expect, test, describe, vi } from "vitest";
import {
  createSignal,
  createWire,
  createStore,
  reify,
  produce,
  StoreManager,
  StoreChange,
  applyStoreChange,
} from "./state";
import { getCursorProxyMeta } from "../utils";

describe("Basic Implementation of Signals & Wires", (test) => {
  test("Signal", () => {
    const val = 1;
    const [getValue, setValue] = createSignal<number>(val);
    expect(getValue()).toBe(val);
  });

  test("Signal with array destructuring", () => {
    const val = 1;
    const sig = createSignal<number>(val);
    expect(sig).toBeDefined();
    const [getValue, setValue] = sig;
    expect(getValue()).toBe(val);
    setValue(3);
    expect(getValue()).toBe(3);
  });

  test("Wire", () => {
    const [getValue, setValue] = createSignal<number>(2);
    const w = createWire(($, wire) => {
      const val = getValue($);
      return val;
    });
    expect(w.run()).toBe(getValue());
  });
});

describe("Nested Signals & Wires", (test) => {
  test("Nested Wires should cleanup and not fire multiple times in case of nested wires", () => {
    const c = { log: (...v: any[]) => console.log(...v) };
    const lSpy = vi.spyOn(c, "log");
    const [get, set] = createSignal(1);
    const w = createWire(($, { wire }) => {
      const val = get($);
      const b = wire(($, { wire: w }) => {
        const doubleCount = get($) * 2;
        c.log("doublecount", doubleCount);
        return val;
      });
      b.run();
      return val;
    });
    w.run();
    set(4);
    expect(lSpy.mock.calls.length).toBe(2);
  });
});

describe("Basic Implementation of Stores & Wires", (test) => {
  // test that wire only runs when subscribed cursors are updated
  test("Wire", () => {
    const c = { log: (...v: any[]) => console.log(...v) };
    const lSpy = vi.spyOn(c, "log");
    const val: { list: number[]; friends: { id: string; name: string }[] } = {
      list: [1, 2, 3],
      friends: [{ id: "2", name: "" }],
    };
    const s = createStore(val);

    const w = createWire(($, wire) => {
      const v = $(s.friends[0].id);

      c.log(JSON.stringify(v));
      return v;
    });
    w.run();
    // ignored since cursor is at  $(s.friends[0].id)
    produce(s.friends, (obj) => {
      obj.push({ id: "2", name: "" });
    });
    produce(s.friends, (obj) => {
      obj[0].id = "33";
    });

    expect(lSpy.mock.calls.length).toBe(2);
  });
  // test that wire only runs when subscribed cursors are updated
  test("Wire at store root", () => {
    const c = { log: (...v: any[]) => console.log(...v) };
    const lSpy = vi.spyOn(c, "log");
    const val: { list: number[] } = {
      list: [1, 2, 3],
    };
    const s = createStore(val);

    const w = createWire(($, wire) => {
      const v = $(s);
      c.log("log", JSON.stringify(v));
      return v;
    });
    w.run();

    produce(s, (obj) => {
      obj.list = [];
    });
    produce(s, (obj) => {
      obj.list = [2];
    });

    expect(lSpy.mock.calls.length).toBe(3);
  });
  test("Test store syncing", () => {
    const store1 = createStore<{ a?: any; list: any[] }>({ list: [] });
    const store2 = createStore<{ a?: any; list: any[] }>({ list: [] });

    const store1Manager: StoreManager = getCursorProxyMeta<StoreManager>(store1);
    const changes: StoreChange[] = [];
    store1Manager.tasks.push({
      path: [],
      observor: (change) => {
        changes.push(change);
      },
    });
    produce(store1, (state) => {
      state.a = 4;
      state.list.push(44);
    });
    expect(changes.length).toBe(2);
    changes.forEach((change) => {
      console.log("1", change);
      applyStoreChange(store2, change);
    });
    const store2Value = reify(store2);
    expect(JSON.stringify(reify(store1))).toBe(JSON.stringify(reify(store2)));
  });
});
