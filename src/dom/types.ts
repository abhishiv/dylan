import { Signal, Wire, StoreCursor, WireFunction } from "../core/state";

import * as DOMConstants from "./constants";
export type DOMNodeType = HTMLElement | DocumentFragment;

export type PrimitiveType = string | number | boolean | null | undefined;

// https://stackoverflow.com/a/50924506
type ExtractGenericFromContext<Type> = Type extends Context<infer X> ? X : never;
export interface ComponentUtils {
  renderContext: RenderContext;
  signal<T = unknown>(name: string, value: T): Signal<T>;
  store<T = unknown>(name: string, value: T): StoreCursor<T>;
  wire<V = unknown>(arg: WireFunction<V>): Wire<V>;
  computedSignal<T = unknown>(name: string, wire: Wire<T>): Signal<T>;
  // todo: fix this typescript definition
  setContext<T = unknown>(ctx: T, value: ExtractGenericFromContext<T>): void;
  getContext<T extends Context>(ctx: T): ExtractGenericFromContext<T>;
  onUnmount(cb: Function): void;
  onMount(cb: Function): void;
  utils: ComponentUtils;
  step: TreeStep;
  api: {
    insert: Function;
    remove: Function;
    update: Function;
  };
}

export type Component<T = unknown> = {
  (this: ComponentUtils, props: T, helpers: ComponentUtils): VElement;
} & { __name__: string };

export interface VElementBase {
  id: string;
}

// Virtual Elements

// NativeVElement
export interface NativeVElement extends VElementBase {
  type: typeof DOMConstants.NATIVE;
  t: string;
  p: Record<string, any> & {
    k: VElement[];
  };
}

// ComponentVElement
export interface ComponentVElement<T = any> extends VElementBase {
  type: typeof DOMConstants.COMPONENT;
  t: Component<T>;
  p: Record<string, any> & {
    k: VElement[];
  };
}

export type VElement<T = any> =
  | NativeVElement
  //  | NativeVElement[]
  | ComponentVElement<T>
  //  | ComponentVElement<T>[]
  | Wire<any>
  // else jsx throws
  | PrimitiveType;

// Tree steps
export type BaseTreeStep = {
  dom?: DOMNodeType;
  id?: string;
  parent?: TreeStep;
  meta?: Record<string, any>;
  k: Array<TreeStep>;
};

export interface NativeTreeStep extends BaseTreeStep {
  type: typeof DOMConstants.NativeTreeStep;
  node: NativeVElement;
}

export interface ComponentTreeStep extends BaseTreeStep {
  type: typeof DOMConstants.ComponentTreeStep;
  node: ComponentVElement<any>;
  wires: Wire[];
  mount?: HTMLElement;
  state: ComponentTreeStepState;
  onUnmount: Function[];
  onMount: Function[];
}

export interface ComponentTreeStepState {
  sigs: Record<string, Signal>;
  stores: Record<string, StoreCursor>;
  ctx: Map<any, any>;
}

export interface PrimitiveTreeStep extends BaseTreeStep {
  type: typeof DOMConstants.PrimitiveTreeStep;
  node: PrimitiveType;
}

export interface WireTreeStep extends BaseTreeStep {
  type: typeof DOMConstants.WireTreeStep;
  node: VElement;
}

export type TreeStep = NativeTreeStep | ComponentTreeStep | PrimitiveTreeStep | WireTreeStep;

// mainly used by HMR & devtools
export interface RenderContext {
  id: string;
  el: Element;
  prev: Map<string[], ComponentTreeStepState>;
  reg: TreeStep[];
}

// Context like you'll find in react/solid
export type Context<T = Signal | StoreCursor> = {
  sym: symbol;
};
