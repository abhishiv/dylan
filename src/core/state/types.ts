import { ApplyData } from "on-change";
import * as Constants from "../constants";
import { ObjPathProxy } from "../../utils/index";
export { getCursorProxyMeta as getProxyMeta, getCursor as getProxyPath } from "../../utils/index";
export type { ObjPathProxy } from "../../utils/index";

export type SignalGetter<T = any> = {
  (arg?: SubToken): T;
  type: typeof Constants.SIGNAL_GETTER;
  sig: Signal<T>;
};
export type SignalSetter<T> = (newValue: T) => void;

export type SignalAPI<T = any> = [SignalGetter<T>, SignalSetter<T>];

export type Signal<T = unknown> = SignalAPI & {
  id: number;
  /** Wires subscribed to this signal */
  w: Array<Wire<any>>;
  /** To check "if x is a signal" */
  type: typeof Constants.SIGNAL;

  v: T;
  get: SignalGetter<T>;
  set: SignalSetter<T>;
};

export type ExtractElement<ArrayType extends ArrayOrObject> = ArrayType extends readonly (infer ElementType)[]
  ? ElementType
  : never;

export type ArrayOrObject = Array<unknown>;

export type ArrayOrObjectAndNotFunction = ArrayOrObject & ({ bind?: never } | { call?: never });

export type StoreCursor<T = unknown, TRoot = T> = T extends ArrayOrObjectAndNotFunction
  ? {
      [P in keyof T]: T[P];
    }
  : T;

type extractGeneric<Type> =
  Type extends ObjPathProxy<unknown, infer X> ? X : Type extends StoreCursor<infer X> ? X : never;

export type StoreManager<T = unknown> = {
  id: string;
  v: T;
  rootCursor?: StoreCursor;
  /** Wires subscribed to this signal */
  w: Array<Wire<any>>;
  type: typeof Constants.STORE;
  tasks: Array<{
    path: string[];
    observor: (change: StoreChange) => void;
  }>;
  get: (cursor: StoreCursor, token: SubToken) => any;
  unsub: Function;
};

export type StoreChangeData = ApplyData;

export type StoreChange = {
  path: string[];
  data: StoreChangeData;
  value: any;
};

/** 3 bits: [RUNNING][SKIP_RUN_QUEUE][NEEDS_RUN] */
type WireState = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Wire<T = unknown> = {
  id: number;
  type: typeof Constants.WIRE;

  fn: WireFunction<T> | StoreCursor;
  // FSM state 3-bit bitmask: [RUNNING][SKIP_RUN_QUEUE][NEEDS_RUN]
  state: WireState;
  r: number;
  v?: T;

  // Run the wire
  run: () => T;

  // Signals/Stores read-subscribed last run
  sigs: Array<Signal<any>>;
  stores: Map<StoreManager, Set<string>>;

  // Post-run tasks
  tasks: Array<(nextValue: T) => void>;

  // Wire that created this wire (parent of this child)
  upper: Wire | undefined;
  // Wires created during this run (children of this parent)
  lower: Array<Wire>;

  token: SubToken;
  subWire: WireFactory;
};

export type WireFactory<T = any> = (arg: WireFunction<T>) => Wire<T>;

export type WireFunction<T = unknown> = {
  ($: SubToken, params: { createWire: WireFactory; wire: WireFactory; previousValue?: T }): T;
};

export type SubToken = {
  <T = unknown>(sig: Signal<T> | T): T;
  wire: Wire<any>;
  type: typeof Constants.SUBTOKEN;
};
