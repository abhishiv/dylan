import onChange, { ApplyData } from "on-change";
import { getCursor, getValueUsingPath } from "../../utils/index";
import * as Constants from "../constants";
import { StoreCursor, StoreManager, SubToken, Wire } from "./types";
import { runWires } from "./wire";
export { getCursorProxyMeta as getProxyMeta, getCursor as getProxyPath } from "../../utils/index";
export type { ObjPathProxy } from "../../utils/index";

const encodeCursor = (cursor: string[]) => JSON.stringify(cursor);
const decodeCursor = (str: string) => JSON.parse(str);

// Create the store manager with essential functionalities
export const createStoreManager = <T>(id: number, observedObject: Record<any, any>): StoreManager<T> => {
  const manager: StoreManager<T> = {
    id: "store|" + id,
    v: observedObject,
    w: [],
    type: Constants.STORE,
    tasks: [],
    unsub: () => {
      onChange.unsubscribe(observedObject);
    },
    get: (cursor: StoreCursor, token: SubToken) => createStoreSubscription(manager, cursor, token.wire),
  };
  console.log(manager);
  return manager;
};

// Get the value from the store based on a cursor path
const createStoreSubscription = <T>(manager: StoreManager, cursor: StoreCursor, wire: Wire): any => {
  const cursorPath = getCursor(cursor);
  const encodedCursor = encodeCursor(cursorPath);
  manager.w.push(wire);
  if (wire.stores.has(manager)) {
    wire.stores.get(manager)?.add(encodedCursor);
  } else {
    const set = new Set<string>();
    set.add(encodedCursor);
    wire.stores.set(manager, set);
  }
  return getValueUsingPath(manager.v as any, cursorPath);
};

// Handle changes in the store and trigger associated tasks and wires
export const handleStoreChange = (
  manager: StoreManager,
  path: (string | symbol)[],
  newValue: any,
  oldValue: any,
  changeData: ApplyData
) => {
  //  if (path[0] !== "state")
  //    console.log(
  //      "handleStoreChange",
  //      path,
  //      newValue,
  //      oldValue,
  //      changeData,
  //      manager.value
  //    );
  const changePath = path as string[];
  adjustCursorForArrayChange(manager, path as string[], changeData);
  const wiresToRun = findMatchingWires(manager, changePath, changeData);
  runWires(wiresToRun);
  triggerStoreTasks(manager, changePath, newValue, changeData);
};

// Find wires that match the change path
const findMatchingWires = (manager: StoreManager, changePath: string[], changeData: ApplyData): Array<Wire> => {
  const matchingWires: Wire[] = [];

  manager.w.forEach((wire) => {
    const cursors = wire.stores.get(manager);
    if (!cursors) return;

    for (const cursorStr of cursors) {
      const cursor = decodeCursor(cursorStr);
      const isMatch = matchCursorToChange(cursor, changePath, changeData);
      isMatch && matchingWires.push(wire);
    }
  });

  return matchingWires;
};

// Determine if a cursor matches the change path
const matchCursorToChange = (cursor: string[], changePath: string[], changeData: ApplyData): boolean => {
  if (changeData === undefined) {
    return cursor.length <= changePath.length
      ? encodeCursor(changePath.slice(0, cursor.length)) == cursor.join("/")
      : true;
  }

  if (["splice", "push", "pop"].includes(changeData.name)) {
    return encodeCursor(changePath.slice(0, cursor.length)) == cursor.join("/");
  }

  return false;
};

// Trigger tasks based on the change path
const triggerStoreTasks = (manager: StoreManager, changePath: string[], newValue: any, changeData: ApplyData) => {
  manager.tasks.forEach(({ path, observor }) => {
    const isPathMatching = changePath.slice(0, path.length).join("/") === path.join("/");
    if (isPathMatching) {
      observor({
        data: (changeData
          ? {
              name: changeData.name,
              args: changeData.args,
              result: undefined,
            }
          : undefined) as any,
        path: changePath,
        value: newValue,
      });
    }
  });
};

//
// Function to adjust cursor paths for array changes
function adjustCursorForArrayChange(manager: StoreManager, changePath: string[], change: ApplyData): void {
  if (!change || change.name !== "splice") {
    return;
  }
  const args = change.args as [string, string, ...any];
  const start = parseInt(args[0]);
  const deleteCount = parseInt(args[1]);
  const items = args.slice(2);

  //  console.log("adjustCursorForArrayChange", { start, deleteCount });

  manager.w.forEach((wire) => {
    wire.stores.forEach((cursorSet) => {
      const { rm: toRemove, add: toAdd } = adjustCursorsInSet(cursorSet, changePath, start, deleteCount, items);

      toRemove.forEach((cursor) => cursorSet.delete(cursor));
      toAdd.forEach((cursor) => cursorSet.add(cursor));

      //console.log({ toRemove, toAdd }, wire.storesRS);
    });
  });

  manager.tasks.forEach((task) => {
    if (isPathAffected(task.path, changePath)) {
      const listenerIndex = getListenerIndex(task.path, changePath.length);

      if (start + deleteCount <= listenerIndex) {
        const newIndex = listenerIndex - deleteCount + items.length;
        task.path[changePath.length] = newIndex.toString();
        //console.log("Updated task path", encodeCursor(task.path));
      }
    }
  });
}

function adjustCursorsInSet(
  cursorSet: Set<string>,
  changePath: string[],
  start: number,
  deleteCount: number,
  items: any[]
): { rm: string[]; add: string[] } {
  const toRemove: string[] = [];
  const toAdd: string[] = [];

  cursorSet.forEach((cursorString) => {
    const cursor = decodeCursor(cursorString);
    if (isPathMatching(cursor, changePath)) {
      const listenerIndex = getListenerIndex(cursor, changePath.length);

      if (start + deleteCount <= listenerIndex) {
        toRemove.push(cursorString);
        cursor[changePath.length] = (listenerIndex - deleteCount + items.length).toString();
        toAdd.push(encodeCursor(cursor));
      }
    }
  });

  return { rm: toRemove, add: toAdd };
}

function isPathMatching(cursor: string[], changePath: string[]): boolean {
  return encodeCursor(changePath) === encodeCursor(cursor.slice(0, changePath.length));
}

function getListenerIndex(cursor: string[], pathLength: number): number {
  return parseInt(cursor[pathLength]);
}

function isPathAffected(path: string[], changePath: string[]): boolean {
  return encodeCursor(changePath) === encodeCursor(path.slice(0, changePath.length)) && path.length > changePath.length;
}
