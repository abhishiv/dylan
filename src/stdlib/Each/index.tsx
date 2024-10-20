/** @jsx h **/

import {
  SubToken,
  StoreCursor,
  StoreManager,
  StoreChange,
  ArrayOrObject,
  ExtractElement,
  arrayRemoveItem,
} from "../../core/state";
import { h, component, Fragment } from "../../dom/index";
import { ComponentUtils, VElement } from "../../dom/types";
import { ParentWireContext } from "../../dom/index";
import { META_FLAG, ObjPathProxy, getCursor } from "../../utils/index";
import { TreeStep } from "../../dom/types";
import { getUtils, addNode, removeNode } from "../../dom/api";
import { reifyTree, getTreeStep } from "../../dom/traverser";
import { getValueUsingPath } from "../../utils/index";
import { createError } from "../../dom/utils";

export const Each: <T extends ArrayOrObject>(
  props: {
    cursor: StoreCursor<T>;
    renderItem: (item: { value: ExtractElement<T> }, index: number | string, list: T) => VElement;
  },
  utils: ComponentUtils
) => VElement = component(
  "Each",
  (props, { wire, setContext, signal, utils, step: parentStep, renderContext, onMount, onUnmount }) => {
    const listCursor = props.cursor;
    const store: StoreManager = (listCursor as any)[META_FLAG];
    const listCursorPath: string[] = getCursor(listCursor);
    //    console.log("Each", listCursorPath);

    const listValue: typeof listCursor = getValueUsingPath(store.v as any, listCursorPath) as typeof listCursor;
    //console.log("value", value);
    const isArray = Array.isArray(listValue);
    if (!isArray) throw createError(110);

    const getItemCursor = (item: ExtractElement<typeof listCursor>, i: number) => {
      return new Proxy(
        {},
        {
          get(target, p, receiver) {
            if (p === "value") {
              const store: StoreManager = (listCursor as any)[META_FLAG];
              const listValue: typeof listCursor = getValueUsingPath(
                store.v as any,
                listCursorPath
              ) as typeof listCursor;
              //      console.log("listValue", listValue, item);
              const index = Number.isFinite(i) ? i : listValue.indexOf(item);
              if (index > -1) {
                return props.cursor[index];
              } else {
                // debugger;
              }
            }
          },
        }
      );
    };

    const observor = function (change: StoreChange) {
      const { data, path, value } = change;
      // console.log("Each list change", change, listCursorPath, path);
      const pStep = parentStep.k[0];
      const previousChildren = [...(pStep.k || [])];
      // list reset
      if (listCursorPath.join() === path.join() && !data) {
        previousChildren.forEach((node) => {
          removeNode(renderContext, node);
        });
        const startIndex = 0;
        const before = previousChildren[startIndex + 0] || null;
        console.time("els");
        const v = value as typeof props.cursor;
        const elements = v.map((item, index) =>
          renderArray(pStep, props.renderItem, listCursor, value, index, utils, getItemCursor)
        );
        const els = elements.map((el) => el[1]);
        console.timeEnd("els");
        // console.log("els", els);
        console.time("reifyTree");
        const [registry, root] = reifyTree(renderContext, els, pStep);
        console.timeEnd("reifyTree");
        console.time("addNode");
        addNode(renderContext, pStep, root, before);
        console.timeEnd("addNode");
        return;
      }

      // important
      // filter changes so you don't try to render invalid changes

      if (path.slice(0, listCursorPath.length).join("/") !== path.join("/")) return;
      //      console.log("each", change, listCursorPath);
      if (data?.name === "push") {
        //        console.log("data", data);
        data.args.forEach((arg, i) => {
          const index = previousChildren.length + i;
          const [treeStep, el] = renderArray(pStep, props.renderItem, listCursor, value, index, utils, getItemCursor);
          // console.log({ treeStep, el, index, previousChildren });
          const [registry, root] = reifyTree(renderContext, el, pStep);
          addNode(renderContext, pStep, root);
        });
      } else if (data?.name === "pop") {
        if (previousChildren.length > 0) {
          const lastNode = previousChildren[previousChildren.length - 1];
          removeNode(renderContext, lastNode);
        }
      } else if (data?.name === "splice") {
        const args = data.args as [string, string];
        const startIndex = parseInt(args[0]);
        const deleteCount = parseInt(args[1]);
        const [_, __, ...items] = data.args as [string, number, ...any];
        const nodesToRemove = previousChildren.slice(startIndex, startIndex + deleteCount);

        //        console.log(
        //          "Each nodesToRemove",
        //          previousChildren,
        //          nodesToRemove,
        //          data
        //        );

        // Remove the nodes that are being spliced out
        nodesToRemove.forEach((n) => removeNode(renderContext, n));

        // Add the new nodes being spliced in
        items.forEach((item, i) => {
          const index = startIndex + i;
          const previousChildren = [...(pStep.k || [])];
          const [treeStep, el] = renderArray(pStep, props.renderItem, listCursor, value, index, utils, getItemCursor);
          const [registry, root] = reifyTree(renderContext, el, pStep);
          const before = previousChildren[startIndex + i] || null;
          addNode(renderContext, pStep, root, before);
        });
      }
    };
    const task = { path: listCursorPath, observor };
    onMount(() => {
      store.tasks.push(task);
    });
    onUnmount(() => {
      arrayRemoveItem(store.tasks, task);
    });

    return (
      <Fragment>
        {listValue.map((el, index) => {
          const cursor = getItemCursor.bind(null, el as any) as any;
          return props.renderItem(cursor, index, listCursor);
        })}
      </Fragment>
    );
  }
);

const renderArray = (
  parentStep: TreeStep,
  renderItem: Function,
  cursor: any,
  list: any[],
  index: number,
  utils: ComponentUtils,
  getItemCursor: Function
) => {
  // console.log(getCursor(cursor));
  const vEl = renderItem(getItemCursor(cursor[index], index), index);
  const treeStep = getTreeStep(parentStep, undefined, vEl);
  return [treeStep, vEl];
};
