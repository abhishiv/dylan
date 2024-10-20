import { StoreManager, Wire, wireReset } from "../core/state";
import * as DOMConstants from "../dom/constants";
import { getCursorProxyMeta } from "../utils";
import { getRenderContext, renderTreeStep, rmNodes } from "./api";
import type { GenericEventAttrs, HTMLAttrs, HTMLElements, SVGAttrs, SVGElements } from "./jsx";
import {
  Component,
  ComponentUtils,
  ComponentVElement,
  Context,
  NativeVElement,
  RenderContext,
  TreeStep,
  VElement,
} from "./types";

export { addNode, insertElement, removeElement, removeNode, updateElement } from "./api";
export * as DOMConstants from "./constants";
export { reifyTree } from "./traverser";
export * from "./types";
export { h };

export function defineContext<T = any>(arg?: string): Context<T> {
  return {
    sym: Symbol(arg),
  };
}

export function component<T = any>(
  name: string,
  def: {
    (props: T, helpers: ComponentUtils): VElement;
  }
): Component<T> {
  (def as Component<T>).__name__ = name;
  return def as Component<T>;
}

function h(t: string | Component<any>, p?: any, ...children: VElement[]): VElement {
  const props = {
    ...(p || {}),
    children: [...(children || [])].map((el) => el),
  };
  return {
    type: typeof t === "string" ? DOMConstants.NATIVE : DOMConstants.COMPONENT,
    p: props,
    t: t,
  } as ComponentVElement | NativeVElement;
}

export function render(element: VElement, container: HTMLElement, options = {}) {
  const renderContext = getRenderContext(container, element, (options = {}));
  //console.log("root", renderContext);
  renderTreeStep(renderContext, element);
  return renderContext;
}

export const unmount = (step: TreeStep) => {
  if (step.dom) rmNodes(step.dom);
};

export function unrender(arg: RenderContext | TreeStep[]) {
  const steps = Array.isArray(arg) ? arg : Array.from(arg.reg);
  steps.forEach((step) => {
    unmount(step);
    if (step.type == DOMConstants.ComponentTreeStep) {
      step.wires.forEach((w) => {
        wireReset(w);
      });
      step.wires = [];
      Object.values(step.state.stores).forEach((s) => {
        const manager = getCursorProxyMeta<StoreManager>(s as any);
        manager.tasks = [];
        manager.w = [];
        // manager.unsubscribe();
      });
      step.onUnmount.forEach((el) => el(step));
      // step.state.stores = {};
      Object.values(step.state.sigs).forEach((sig) => {
        sig.w = [];
      });
      step.state.ctx.clear();
    } else if (step.type == DOMConstants.WireTreeStep) {
      const wire = step.node as Wire;
      wireReset(wire);
    }
  });
  return arg;
}

// used to store parent wire in context
export const ParentWireContext = defineContext("ParentWireContext");

export const Fragment = component("Fragment", (props) => props.children);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DistributeWire<T> = T extends any ? Wire<T> : never;
export type MaybeWire<T> = T | DistributeWire<T>;

export declare namespace h {
  export namespace JSX {
    export type AllowWireForProperties<T> = { [K in keyof T]: MaybeWire<T[K]> };

    export type Element = VElement;

    export interface ElementAttributesProperty {
      props: unknown;
    }
    export interface ElementChildrenAttribute {
      children: unknown;
    }

    // Prevent children on components that don't declare them
    export interface IntrinsicAttributes {
      children?: VElement[] | VElement;
      key?: string | number;
      ref?: (el: any) => void;
    }

    // Allow children on all DOM elements (not components, see above)
    // ESLint will error for children on void elements like <img/>
    export type DOMAttributes<Target extends EventTarget> = GenericEventAttrs<Target> & {};

    export type HTMLAttributes<Target extends EventTarget> = AllowWireForProperties<Omit<HTMLAttrs, "style">> & {
      style?: MaybeWire<string>;
    } & DOMAttributes<Target> &
      IntrinsicAttributes;

    export type SVGAttributes<Target extends EventTarget> = AllowWireForProperties<SVGAttrs> &
      HTMLAttributes<Target> &
      IntrinsicAttributes;

    export type IntrinsicElements = {
      [El in keyof HTMLElements]: HTMLAttributes<HTMLElements[El]>;
    } & { [El in keyof SVGElements]: SVGAttributes<SVGElements[El]> };
  }
}
