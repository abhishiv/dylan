import * as Constants from "../core/constants";
import { TreeStep } from "./types";
import { Wire } from "../core/state";
import * as DOMConstants from "./constants";
const createTextNode = (arg: string | number | boolean | null | undefined) =>
  document.createTextNode(arg == null || arg === undefined ? "" : arg + "");

const createMarker = (text: string, owner: DocumentFragment) => {
  const marker = document.createComment(text);
  // (marker as any).__owner__ = owner;
  return marker;
};

// important only use append/prepend
export class LiveDocumentFragment extends DocumentFragment {
  start: Comment;
  end: Comment;
  constructor(t?: string) {
    super();
    this.start = createMarker(`<${t}>`, this);
    this.end = createMarker(`</${t}>`, this);
    super.append(this.start, this.end);
  }
  append(...nodes: Node[]) {
    this.end.before(...nodes);
  }
  prepend(...nodes: Node[]) {
    this.start.after(...nodes);
  }
}

export const createDOMNode = (step: TreeStep, isSvg?: boolean): Node | LiveDocumentFragment | undefined => {
  if (!step || !step.node) return;

  // primitive types
  if (step.type === DOMConstants.PrimitiveTreeStep) {
    return createTextNode(step.node);
  }

  // wire: create text node from wire output
  if (step.type == DOMConstants.WireTreeStep) {
    const wire = step.node as Wire;
    const value = wire.run();
    let childEL: Node | undefined = undefined;
    if (["string", "number", "boolean", "undefined"].indexOf(typeof value) > -1) {
      childEL = createTextNode(value + "");
      wire.tasks.push((val: any) => {
        childEL ? (childEL.textContent = val) : null;
      });
    }
    return childEL;
  }

  if (step.node && typeof step.node === "object") {
    const props: Record<string, any> =
      step.node.type === DOMConstants.COMPONENT || step.node.type === DOMConstants.NATIVE ? step?.node?.p : {};

    // function component
    if (step.node.type === DOMConstants.COMPONENT) {
      return new LiveDocumentFragment(step.node.t.__name__);
    }

    // plain DOM node
    if (step.node.type === DOMConstants.NATIVE) {
      const { t } = step.node;
      const el = isSvg
        ? document.createElementNS("http://www.w3.org/2000/svg", t)
        : document.createElement(step.node.t);

      for (const key in props) {
        // onClick to onclick
        // TODO: handle it better?

        const value = props[key];

        const isFunctionHandler = key[0] == "o" && key[1] == "n";
        const finalKey: string = isFunctionHandler ? key.toLowerCase() : key;
        if (key === "children") {
        } else if (key === "dangerouslySetInnerHTML") {
          el.innerHTML = value.__html;
        } else if (key == "ref" && typeof value === "function") {
          //(value as any)(el);
        } else if (isFunctionHandler) {
          // set function on el
          (el as any)[finalKey] = value;
        } else {
          if (value && value.type === Constants.WIRE) {
            const w: Wire<string> = value;
            const val = w.run();
            setAttributeValue(el, finalKey, val);
            w.tasks.push((val) => {
              setAttributeValue(el, finalKey, val);
            });
          } else {
            setAttributeValue(el, finalKey, value);
          }
        }
      }

      return el;
    }
  }
};

const setAttributeValue = (el: HTMLElement | SVGElement, attr: string, val: any) => {
  try {
    if (val === undefined) {
      (el as HTMLElement).removeAttribute(attr);
    } else {
      (el as HTMLElement).setAttribute(attr, val);
    }
    if (el.tagName === "INPUT" && attr === "checked") (el as HTMLInputElement).checked = !!val;
    if (el.tagName === "INPUT" && attr === "value") (el as HTMLInputElement).value = val;
  } catch (e) {
    //    console.error(el, attr, val);
    throw e;
  }
};
