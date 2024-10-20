// Crawl the tree in post-order.
export const crawl = <T>(root: T, iterate: (node: T) => void, options: { order: "post"; kids: (node: T) => T[] }) => {
  // The stack holds the nodes we need to visit.
  const stack: { node: T; v: boolean }[] = [];
  // Keep track of the nodes we've visited.
  const visited: any[] = [];

  // Push the root node onto the stack to start the traversal.
  stack.push({ node: root, v: false });

  while (stack.length > 0) {
    const { node, v: visitedChildren } = stack[stack.length - 1];
    // If all the node's children have been visited, visit the node and pop it from the stack.
    if (visitedChildren) {
      iterate(node);
      stack.pop();
    } else {
      visited.push(node);
      // Mark that we've visited the node's children.
      stack[stack.length - 1].v = true;
      // Otherwise, push all the unvisited children onto the stack.

      const children = (options.kids(node) || []).reverse();
      for (const child of children) {
        if (visited.indexOf(child) == -1) {
          stack.push({ node: child, v: false });
        }
      }
    }
  }
};

// Helper function for dfsPreOrder.
export const dfsPreOrder = <T>(
  root: T,
  iterate: (attrs: { node: T; i: number }) => void | any,
  kids: (node: T) => T[]
) => {
  // The stack holds the nodes we need to visit.
  const stack: { node: T; i: number }[] = [];

  // Push the root node onto the stack to start the traversal.
  stack.push({ node: root, i: 0 });

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) return;

    // Visit the node.
    const v = iterate(node);
    if (v) return;

    // Push all the children onto the stack in reverse order so that
    // they are processed in the original order.
    const k = kids(node.node);
    //      console.log("k", k);
    const children = [...(k || [])].reverse();
    children.forEach((child, i) => {
      stack.push({ node: child, i });
    });
  }
};
