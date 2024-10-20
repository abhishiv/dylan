import { unrender } from ".";
import { Signal, StoreCursor, createComputedSignal, createSignal, createStore, createWire } from "../core/state";
import * as DOMConstants from "./constants";
import { LiveDocumentFragment } from "./dom";
import { reifyTree } from "./traverser";
import { ComponentTreeStep, ComponentUtils, RenderContext, TreeStep, VElement } from "./types";
import {
  arrayRemove,
  createError,
  getContextProvider,
  getDescendants,
  getTreeStepRenderContextState,
  getVirtualElementId,
} from "./utils";

export const insertElement = (
  renderContext: RenderContext,
  parentStep: TreeStep,
  parentPath: string[],
  el: VElement,
  after?: string
) => {
  //  console.log("insert", parentPath, el, after);

  const step = parentPath.reduce<TreeStep | undefined>((step, key) => {
    if (!step) return;
    const child = step.k.find((el) => el.id === key);
    return child;
  }, parentStep);
  if (!step) throw createError(120);

  const afterIndex = after ? step.k.findIndex((el) => el.id === after) : undefined;

  const [registry, root] = reifyTree(renderContext, el, step, afterIndex);

  addNode(renderContext, step, root, afterIndex && afterIndex > -1 ? step.k[afterIndex as number] : undefined);
};

export const removeElement = (
  renderContext: RenderContext,
  parentStep: TreeStep,
  parentPath: string[],
  key: string
) => {
  const step = parentPath.reduce<TreeStep | undefined>((step, key) => {
    if (!step) return;
    const child = step.k.find((el) => el.id === key);
    return child;
  }, parentStep);
  if (!step) throw createError(102);
  const child = step.k.find((el) => el.id === key);
  if (!child) throw createError(102);
  removeNode(renderContext, child);
};

export const updateElement = (renderContext: RenderContext, parentStep: TreeStep, key: string[], value: string) => {
  // todo
};

export const getLiveFragmentChildNodes = (frag: LiveDocumentFragment) => {
  const els: Node[] = [];
  let node: Node | null = frag.start;
  while (node) {
    els.push(node);
    if (node === frag.end) {
      break;
    }
    node = node.nextSibling;
  }
  return els;
};

export const addNode = (
  renderCtx: RenderContext,
  parentStep: TreeStep | undefined,
  node: TreeStep | TreeStep[],
  before?: TreeStep
) => {
  //console.log("addNode", parentStep, node, before);
  const [nodes, elementsToInsert] = Array.isArray(node)
    ? [node, node.map((el) => el.dom)]
    : [[node], node.dom instanceof DocumentFragment ? node.dom : [node.dom]];
  //  console.log("addNode", nodes, elementsToInsert);
  const handle = (node: TreeStep) => {
    const nodes = getDescendants(node);
    //console.log("n", nodes, nodes.length);
    renderCtx.reg.push(...nodes);
    node.parent = parentStep;

    // dom
    nodes.forEach((step) => {
      // call onMount
      // call ref
      if (step.type === DOMConstants.ComponentTreeStep || step.type === DOMConstants.NativeTreeStep) {
        if (step.node.p && step.node.p.ref && step.dom) {
          step.node.p.ref(step.dom);
        }
      }
      if (step.type === DOMConstants.ComponentTreeStep && step.onMount.length > 0) {
        step.onMount.forEach((el) => el());
      }
    });
  };

  nodes.forEach(handle);

  if (!parentStep) {
    //      console.log("no parent", renderCtx.el, node.dom);
    renderCtx.el.append.apply(renderCtx.el, [elementsToInsert]);
  } else {
    if (parentStep && before) {
      const beforeIndex = parentStep.k.indexOf(before);
      parentStep.k.splice(beforeIndex, 0, ...nodes);

      const refNode: HTMLElement = before.dom as HTMLElement;
      refNode.before.apply(refNode, elementsToInsert);
    } else if (parentStep) {
      const parentDOM = parentStep.dom;
      parentStep.k.push(...nodes);
      if (parentDOM && (parentDOM as HTMLElement)) {
        parentDOM.append.apply(parentDOM, elementsToInsert);
      }
    }
  }
};

export const rmNodes = (node: Node | LiveDocumentFragment) => {
  if (node instanceof LiveDocumentFragment) {
    const childNodes = getLiveFragmentChildNodes(node);
    //console.log("childNodes", childNodes.length, childNodes);
    childNodes.forEach((c) => c.parentNode?.removeChild(c));
  } else {
    node.parentElement?.removeChild(node);
  }
};

export const removeNode = (renderCtx: RenderContext, node: TreeStep) => {
  //console.log("removeNodes", nodes);
  const nodes = getDescendants(node);
  //  console.log("removeNode nodes", node, nodes);
  unrender(nodes);
  nodes.forEach((step) => {
    const index = renderCtx.reg.indexOf(step);
    index > -1 && renderCtx.reg.splice(index, 1);
    step.parent ? arrayRemove(step.parent.k, step) : null;
  });
};

export const renderTreeStep = (renderCtx: RenderContext, element: VElement) => {
  // todo: move this to getRenderContext so it clears DOM properly
  //if (window.ss) return;
  renderCtx.el.innerHTML = "";
  const [registry, root] = reifyTree(renderCtx, element);
  if (Array.isArray(root)) throw createError(101);
  const id = getVirtualElementId(root.node);
  if (!id) throw createError(101);
  addNode(renderCtx, undefined, root);
};

export const getRenderContext = (container: HTMLElement, element: VElement, options = {}) => {
  const id = getVirtualElementId(element);
  if (!id) throw createError(101);

  const renderContext: RenderContext = (container as any)[id] || {
    prev: new Map(),
    el: container,
    id,
    reg: [],
  };

  //console.log("renderContext", renderContext);
  renderContext.prev.clear();

  // so HMR is properly cleaned up
  renderContext.reg.forEach((step) => {
    //console.log("step", step);
    if (step.type === DOMConstants.ComponentTreeStep && step.onUnmount.length > 0)
      step.onUnmount.forEach((el) => el(step));
    if (step.type === DOMConstants.ComponentTreeStep) {
      if (step.mount && step.dom) {
        rmNodes(step.dom);
      }
    }

    if (step.type === DOMConstants.ComponentTreeStep) {
      const ids: string[] = [];
      let ancestor: TreeStep | undefined = step;
      while (ancestor) {
        // since primitive elements can't have children this is safe
        if (ancestor.id) {
          ids.push(ancestor.id);
        }
        ancestor = ancestor.parent;
      }
      // dont preserve stores for now
      renderContext.prev.set(ids, {
        ...step.state,
        //stores: {},
        //signals: {},
      });
    }
  });
  //if (window.ss) return;

  renderContext.reg = [];
  (container as any)[id] = renderContext;

  return renderContext;
};

export const getUtils = (
  renderContext: RenderContext,
  parentStep: ComponentTreeStep
): Omit<ComponentUtils, "utils"> => {
  return {
    step: parentStep,
    renderContext,
    signal(name: string, val) {
      const match = getTreeStepRenderContextState(renderContext, parentStep);

      // this enables state preservation during HMR
      const s =
        match && match.sigs && match.sigs[name]
          ? (match.sigs[name] as Signal<any>)
          : (createSignal(val) as Signal<any>);
      parentStep.state.sigs[name] = s;
      return s;
    },
    computedSignal(name: string, wire) {
      const match = getTreeStepRenderContextState(renderContext, parentStep);

      // this enables state preservation during HMR
      const s =
        match && match.sigs && match.sigs[name]
          ? (match.sigs[name] as Signal<any>)
          : (createComputedSignal(wire) as Signal<any>);
      parentStep.state.sigs[name] = s;
      return s;
    },
    wire(arg) {
      const w = createWire(arg);
      parentStep.wires?.push(w);
      return w;
    },
    store(name: string, val) {
      const match = getTreeStepRenderContextState(renderContext, parentStep);

      // HMR
      const s =
        match && match.stores && match.stores[name]
          ? (match.stores[name] as StoreCursor)
          : (createStore(val) as StoreCursor);
      parentStep.state.stores[name] = s;
      return s as StoreCursor<any>;
    },
    setContext(ctx, value?) {
      parentStep.state.ctx.set(ctx, value || createSignal(undefined));
    },
    getContext: (token) => {
      //console.time("ctx");
      const ancestor = parentStep && getContextProvider(token, parentStep);
      //console.timeEnd("ctx");
      if (ancestor && ancestor.type === DOMConstants.ComponentTreeStep) {
        return ancestor.state.ctx.get(token);
      } else {
        //console.error(token, parentStep);
        //throw createError(103, `${token.sym.toString()} not found`);
      }
    },
    onUnmount: (cb) => {
      (parentStep as ComponentTreeStep).onUnmount.push(cb);
    },
    onMount: (cb) => {
      (parentStep as ComponentTreeStep).onMount.push(cb);
    },
    api: {
      insert: insertElement.bind(null, renderContext, parentStep),
      remove: removeElement.bind(null, renderContext, parentStep),
      update: updateElement.bind(null, renderContext, parentStep),
    },
  };
};
