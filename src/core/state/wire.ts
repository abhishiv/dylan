import { getCursorProxyMeta } from "../../utils/index";
import * as Constants from "../constants";
import { Signal, SignalGetter, StoreCursor, StoreManager, SubToken, Wire, WireFactory, WireFunction } from "./types";
import { arrayRemoveItem, isSignal, isSignalGetter, isStoreCursor } from "./utils";
export { getCursorProxyMeta as getProxyMeta, getCursor as getProxyPath } from "../../utils/index";
export type { ObjPathProxy } from "../../utils/index";

let WIRE_COUNTER = 0;

const S_RUNNING = 0b100 as const;
const S_SKIP_RUN_QUEUE = 0b010 as const;
const S_NEEDS_RUN = 0b001 as const;

export const createWire: WireFactory = (arg: WireFunction): Wire => {
  WIRE_COUNTER++;
  const wire: Wire = {
    id: WIRE_COUNTER,
    type: Constants.WIRE,
    fn: arg,
    sigs: [],
    stores: new Map(),
    tasks: [],
    state: S_NEEDS_RUN,
    upper: undefined,
    lower: [],
    r: 0,
    run: () => {
      return runWire(arg, wire.token, wire.subWire);
      // Clean up unused nested wires
    },
    subWire: (subFn: WireFunction) => {
      const subWire = createWire(subFn);
      subWire.upper = wire;
      wire.lower.push(subWire);
      return subWire;
    },
    token: undefined as any,
  };
  wire.token = getSubtoken(wire);
  return wire;
};

const getSubtoken = (wire: Wire): SubToken => {
  const token: SubToken = (arg: Signal | StoreCursor | SignalGetter) => {
    if (isSignal(arg)) {
      const v = arg.get(token);
      wire.v = v;
      return v;
    } else if (isSignalGetter(arg)) {
      const sig = arg.sig;
      const v = sig.get(token);
      wire.v = v;
      return v;
    } else if (isStoreCursor(arg)) {
      const cursor = arg;
      const manager = getCursorProxyMeta<StoreManager>(cursor);
      const v = manager.get(cursor, token);
      wire.v = v;
      return v;
    }
  };
  token.wire = wire;
  token.type = Constants.SUBTOKEN;
  return token;
};

export const runWire = (
  arg: WireFunction | Signal | StoreCursor | SignalGetter,
  token: SubToken,
  subWireFactory: WireFactory
) => {
  if (isStoreCursor(arg)) {
    const cursor = arg;
    const v = token(cursor);
    token.wire.v = v;
    return v;
  } else if (isSignal(arg)) {
    const sig = arg;
    const v = token(sig);
    token.wire.v = v;
    return v;
  } else if (isSignalGetter(arg)) {
    const sig = arg.sig;
    const v = token(sig);
    token.wire.v = v;
    return v;
  } else {
    const fn = arg as WireFunction;
    const v = fn(token, {
      createWire: subWireFactory,
      wire: subWireFactory,
      previousValue: token.wire.v,
    });
    token.wire.v = v;
    return v;
  }
};

export const wireReset = (wire: Wire<any>): void => {
  wire.lower.forEach(wireReset);
  wire.sigs.forEach((signal) => arrayRemoveItem(signal.w, wire));
  wire.stores.forEach((store) => {
    const manager = getCursorProxyMeta<StoreManager>(store);
    if (manager) {
      arrayRemoveItem(manager.w, wire);
    }
  });
  _initWire(wire);
};

const _initWire = (wire: Wire<any>): void => {
  wire.state = S_NEEDS_RUN;
  wire.lower = [];
  // Drop all signals now that they have been unlinked
  wire.sigs = [];
  wire.stores = new Map();
};

// Pauses a wire so signal writes won't cause runs. Affects nested wires
const wirePause = (wire: Wire): void => {
  wire.lower.forEach(wirePause);
  wire.state |= S_SKIP_RUN_QUEUE;
};

// Resumes a paused wire. Affects nested wires but skips wires belonging to computed-signals. Returns true if any runs were missed during the pause
const wireResume = (wire: Wire): boolean => {
  wire.lower.forEach(wireResume);
  wire.state &= ~S_SKIP_RUN_QUEUE;
  return !!(wire.state & S_NEEDS_RUN);
};

export const runWires = (wires: Array<Wire<any>>): void => {
  // Use a new Set() to avoid infinite loops caused by wires writing to signals
  // during their run.
  const toRun = wires;
  let curr: Wire<any> | undefined;
  // Mark upstream computeds as stale. Must be in an isolated for-loop
  toRun.forEach((wire) => {
    if (wire.state & S_SKIP_RUN_QUEUE) {
      arrayRemoveItem(toRun, wire);
      wire.state |= S_NEEDS_RUN;
    }
    // TODO: Test (#3) + Benchmark with main branch
    // If a wire's ancestor will run it'll destroy its lower wires. It's more
    // efficient to not call them at all by deleting from the run list:
    curr = wire;
    while ((curr = curr.upper)) if (toRun.indexOf(curr) > -1) return arrayRemoveItem(toRun, wire);
  });
  for (var wire of toRun) {
    const previousValue = wire.v;
    const val = runWire(wire.fn, wire.token, wire.subWire);

    wire.r = wire.r + 1;
    if (val === previousValue) return;

    wire.v = val;
    for (const task of wire.tasks) {
      task(val);
    }
  }
};
