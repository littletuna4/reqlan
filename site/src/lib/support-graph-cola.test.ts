import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clampGraphPoint,
  createLaidOutSupportGraph,
  createSupportColaGraph,
  graphCanvasForView,
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  hungerOffset,
  HUNGER_MAX,
  pinColaNode,
  pointerExceededDragThreshold,
} from "./support-graph-cola.js";

describe("support graph cola helpers", () => {
  // rq:["../../../reqlan rq/site/support-page.rq".support_page]
  it("leans nodes toward the cursor, never more than HUNGER_MAX", () => {
    const lean = hungerOffset(10, 10, { x: 20, y: 10 });
    assert.ok(lean.x > 0);
    assert.equal(lean.y, 0);
    assert.ok(Math.hypot(lean.x, lean.y) <= HUNGER_MAX + 1e-9);
    assert.deepEqual(hungerOffset(10, 10, null), { x: 0, y: 0 });
  });

  it("ignores small pointer moves so clicks still fire", () => {
    assert.equal(pointerExceededDragThreshold(0, 0, 3, 3), false);
    assert.equal(pointerExceededDragThreshold(0, 0, 5, 0), true);
  });

  it("builds an action-to-group edge for each action", () => {
    const { nodes, links } = createSupportColaGraph();
    const groups = nodes.filter((node) => node.kind === "group");
    const actions = nodes.filter((node) => node.kind === "action");
    assert.equal(groups.length, 5);
    assert.equal(links.length, actions.length);
  });

  it("maps the view window to a cola canvas", () => {
    assert.deepEqual(graphCanvasForView(800, 400), {
      width: GRAPH_WIDTH,
      height: 50,
    });
    assert.deepEqual(graphCanvasForView(0, 0), {
      width: GRAPH_WIDTH,
      height: GRAPH_HEIGHT,
    });
  });

  it("lays out inside the view window and leaves edge margin", () => {
    const canvas = { width: GRAPH_WIDTH, height: 120 };
    const laid = createLaidOutSupportGraph(canvas);
    const xs = laid.nodes.map((node) => node.x);
    const ys = laid.nodes.map((node) => node.y);
    for (const node of laid.nodes) {
      assert.equal(typeof node.x, "number");
      assert.equal(typeof node.y, "number");
      assert.ok(node.x >= 0 && node.x <= canvas.width);
      assert.ok(node.y >= 0 && node.y <= canvas.height);
    }
    assert.ok(Math.max(...ys) - Math.min(...ys) < canvas.height * 0.95);
    assert.ok(Math.max(...xs) - Math.min(...xs) < canvas.width * 0.98);
  });

  it("keeps a dropped node at its drag position", () => {
    const { nodes } = createLaidOutSupportGraph();
    const star = nodes.find((node) => node.id === "star");
    assert.ok(star);
    star.x = 41;
    star.y = 22;
    pinColaNode(star);
    assert.equal(star.x, 41);
    assert.equal(star.y, 22);
    assert.equal(star.fixed, 1);
  });

  it("keeps clamped points inside the view window", () => {
    const canvas = { width: 100, height: 50 };
    const inside = clampGraphPoint({ x: -20, y: 200 }, 4, canvas);
    assert.ok(inside.x >= 0 && inside.x <= canvas.width);
    assert.ok(inside.y >= 0 && inside.y <= canvas.height);
  });
});
