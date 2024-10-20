import * as DOMConstants from "./constants";
import { createDOMNode } from "./dom";
import { resolveComponent } from "./resolver";
import { ComponentTreeStep, NativeTreeStep, NativeVElement, RenderContext, TreeStep, VElement } from "./types";
import { checkIfSVG, getVirtualElementId } from "./utils";

import * as Constants from "../core/constants";
import { crawl } from "../utils/crawl";
import { isCursorProxy } from "../utils";

export const reifyTree = (
  renderContext: RenderContext,
  el: VElement | VElement[],
  parent?: TreeStep,
  afterIndex?: number
): [TreeStep[], TreeStep | TreeStep[]] => {
  const registry: Array<TreeStep[]> = [];
  const roots: TreeStep[] = [];
  const fn = (el: VElement) => {
    const registryNodes: TreeStep[] = [];
    const root = getTreeStep(
      parent,
      undefined,
      el,
      Number.isFinite(afterIndex) ? (afterIndex as number) + 1 : 0
    ) as TreeStep;
    roots.push(root);
    // traverse bottom-up(post-order) and assemble dom tree
    //    console.time("creating");
    crawl(
      root,
      function (step) {
        registryNodes.push(step);
        // step.parent.children.push shouldnt be done here for root.parent at least
        // reason more about it: maybe reifyTree shouldn't take parent as prop?
        if (step !== root && step.parent) step.parent.k.push(step);
        const isSVG = checkIfSVG(step);
        const dom = createDOMNode(step, isSVG);
        if (dom) {
          step.dom = dom as HTMLElement;
          //          if (window.a) return;
          const children = step.k;
          if (children.length > 0) {
            const kids = children.reduce<Node[]>((acc, el) => {
              if (el.dom) acc.push(el.dom as Node);
              return acc;
            }, []);
            const p = (step as ComponentTreeStep).mount || (dom as unknown as Element);
            p.append.apply(p, kids);

            //console.log("k", kids);
          }
        }
      },
      {
        order: "post",
        kids: getChildrenFromStep.bind(null, renderContext),
      }
    );
    //    console.timeEnd("creating");
    registry.push(registryNodes);
  };
  Array.isArray(el) ? el.forEach(fn) : fn(el);

  return Array.isArray(el) ? [registry.flat(), roots] : [registry.flat(), roots[0]];
};

const getComponentChildrenFromStep = (renderContext: RenderContext, parentStep: ComponentTreeStep): TreeStep[] => {
  const el = resolveComponent(renderContext, parentStep);
  const r = (Array.isArray(el) ? el : [el])
    .map((item, i) => getTreeStep(parentStep, undefined, item, i) as TreeStep)
    .flat();
  return r;
};

const getPlainNodeChildrenFromStep = (renderContext: RenderContext, parentStep: NativeTreeStep): TreeStep[] => {
  const { node, parent } = parentStep;
  return node
    ? (((node as NativeVElement)?.p?.children || []) as NativeVElement[]).map(
        (item, i) => getTreeStep(parentStep, undefined, item, i) as TreeStep
      )
    : [];
};

const getChildrenFromStep = (renderContext: RenderContext, parentStep: TreeStep): TreeStep[] => {
  if (!parentStep) return [];
  const { node, parent } = parentStep;

  if (node && typeof node === "object") {
    if (isCursorProxy(node)) {
      return [];
    } else if (Array.isArray(node)) {
      // todo fix this
      return [];
    } else if (node.type === DOMConstants.NATIVE) {
      // todo: figure how to remove this typecast
      return getPlainNodeChildrenFromStep(renderContext, parentStep as any);
    } else if (node.type == DOMConstants.COMPONENT) {
      // todo: figure how to remove this typecast
      return getComponentChildrenFromStep(renderContext, parentStep as any);
    }
  }
  return [];
};

export const getTreeStep = (
  parentStep: TreeStep | undefined,
  meta: Record<string, any> | undefined,
  el: VElement,
  index?: number
): TreeStep | TreeStep[] => {
  if (Array.isArray(el)) {
    console.log("el", el);
    return (el as VElement[]).map((el, i) => getTreeStep(parentStep, undefined, el, i) as TreeStep);
  } else {
    const type =
      el === null || el === undefined || typeof el == "string" || typeof el === "number" || typeof el === "boolean"
        ? DOMConstants.PrimitiveTreeStep
        : el.type === DOMConstants.NATIVE
          ? DOMConstants.NativeTreeStep
          : el.type === Constants.WIRE
            ? DOMConstants.WireTreeStep
            : el.type === DOMConstants.COMPONENT
              ? DOMConstants.ComponentTreeStep
              : undefined;
    const step: any = {
      id: getVirtualElementId(el, index),
      node: el,
      meta,
      parent: parentStep,
      k: [],
      type,
    };
    if (type === DOMConstants.ComponentTreeStep) {
      step.state = { sigs: {}, ctx: new Map(), stores: {} };
      step.wires = [];
      step.onMount = [];
      step.onUnmount = [];
    }
    return step;
  }
};
