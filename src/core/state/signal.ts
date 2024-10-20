import * as Constants from "../constants";
export { getCursorProxyMeta as getProxyMeta, getCursor as getProxyPath } from "../../utils/index";
export type { ObjPathProxy } from "../../utils/index";
import { Signal, SignalGetter, SignalSetter, SubToken, Wire } from "./types";
import { runWires } from "./wire";

let SIGNAL_COUNTER = 0;

export const createSignal = <T = any>(val: T): Signal<T> => {
  SIGNAL_COUNTER++;
  const get: SignalGetter<T> = (token?: SubToken) => {
    if (token) {
      // Two-way link. Signal writes will now call/update wire W
      token.wire.sigs.push(sig);
      sig.w.push(token.wire);
      return sig.v as T;
    } else {
      return sig.v as T;
    }
  };
  get.type = Constants.SIGNAL_GETTER;

  const set: SignalSetter<T> = (value: T) => {
    if (sig.v === value) return value;
    sig.v = value;
    runWires(sig.w);
    return val;
  };

  const sig = [get, set] as unknown as Signal<T>;
  sig.id = SIGNAL_COUNTER;
  sig.type = Constants.SIGNAL;
  sig.v = val;
  sig.w = [];

  get.sig = sig;

  sig.get = get;
  sig.set = set;

  return sig;
};

export const createComputedSignal = <T = any>(wire: Wire<T>) => {
  const value = wire.run();
  const signal = createSignal<T>(value);
  const handler = () => {
    if (signal.get() !== wire.v) signal.set(wire.v as T);
  };
  wire.tasks.push(handler);
  return signal;
};
