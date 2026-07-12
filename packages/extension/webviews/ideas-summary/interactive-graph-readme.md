# Interactive graph — development guide

This document explains how the Ideas Summary graph tab handles layout and live physics, why the current design looks the way it does, and what to watch out for when changing it.

**Requirement source:** [`reqlan rq/extension/module/graphical_graph.rq`](../../../../reqlan%20rq/extension/module/graphical_graph.rq) (`layout_physics`, `state_machines`, `physics_options`).

---

## What we are trying to achieve

The graph should feel like Obsidian's local graph: a force-directed web that **keeps gently moving for a long time**, settles to a **stable attractor**, and **never jolts** when you click, select, or drag a node.

Concrete behavioural targets:

| Goal | Meaning |
|------|---------|
| Long convergence | Visible motion for 10 s+ after enabling Animate, not a quick settle |
| Same end state | Toggling Animate off/on, or leaving it on, converges to the same positions from the same starting state |
| Continuous during drag | While a node is held, the rest of the graph keeps reacting (repulsion, springs) around the pointer |
| No jolt on click | Selecting/grabbing without moving must not restart or shock the simulation |
| No snap on release | A dragged node stays where you put it; the sim does not rubber-band or teleport it |
| Orphans move too | Disconnected nodes use the same physics as connected ones |
| Deterministic continuation | Same positions + velocities → same future motion; interactions must not reset global state |

These goals conflict with how most cytoscape layout extensions work. The current architecture exists because of that tension.

---

## Two-phase strategy: batch settle, then continuous physics

The graph uses **two separate systems** with different jobs:

```
┌─────────────────────────────────────────────────────────────────┐
│  Phase 1 — Batch layout (cytoscape layout extension)            │
│  • Runs once on structural change or explicit re-layout         │
│  • Computes a good initial configuration quickly                │
│  • Blocks the main thread for a bounded number of iterations    │
│  • Default: fcose; user can pick cola, cose, grid, etc.         │
└────────────────────────────┬────────────────────────────────────┘
                             │ layoutstop
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 2 — Live physics (custom GraphPhysicsSimulation)         │
│  • Only when "Animate" is on AND layout is force-directed       │
│  • One persistent instance; pause/resume, never rebuild         │
│  • One integration step per requestAnimationFrame               │
│  • Directly writes node.position() — not a cytoscape layout     │
└─────────────────────────────────────────────────────────────────┘
```

**Why split?**

- Batch algorithms (fcose, cola) are good at producing a readable layout from scratch in a few hundred milliseconds.
- Obsidian-style *continuous* physics needs **persistent velocity state**, **pin/unpin during drag without restart**, and **deterministic forces** — none of which cytoscape's layout API is designed for.
- Running a layout extension every frame (or restarting it on every interaction) resets internal solver state and produces jolts, snaps, and different attractors.

---

## Packages and roles

| Package | Version (approx.) | Role today |
|---------|-------------------|------------|
| [`cytoscape`](https://js.cytoscape.org/) | ^3.33 | Core graph: elements, rendering, pan/zoom, drag events, `node.position()` |
| [`cytoscape-fcose`](https://github.com/iVis-at-Bilkent/cytoscape.js-fcose) | ^2.2 | **Default batch layout** — fast force-directed settle on structural change |
| [`cytoscape-cola`](https://github.com/cytoscape/cytoscape-cola) | ^2.5 | **Optional batch layout** in the dropdown; *not* used for live Animate physics |
| Custom `graph-physics.ts` | — | **Live Animate physics** — centroid gravity + springs + repulsion |

Built-in cytoscape layouts (`breadthfirst`, `circle`, `concentric`, `grid`, `random`) are configured in `graph-cytoscape.ts` but do not participate in live physics (`isForceDirectedLayout` gates Animate).

### Canvas renderer note

The controller initialises cytoscape with **Canvas 2D only** (`pixelRatio: 1`, no WebGL). In VS Code webviews, WebGL often draws nothing when styles reference unresolved CSS variables — users saw an empty graph with only a "webgl rendering enabled" log.

---

## Physics approaches compared

Understanding what was tried (and rejected) prevents regressions.

### 1. Batch force-directed layouts (fcose, cose, cola)

**Model:** Run N iterations (or a time cap), write final positions, stop.

**Good for:** Initial placement, re-layout after filter/compound change, non-animated layouts.

**Bad for live physics because:**

- Each `layout.run()` is a **fresh solve** from the current positions with **no carried velocity**.
- Iteration count and convergence criteria are tuned for **speed**, not long gentle drift.
- `layoutstop` is the natural end — there is no "pause and resume the same trajectory" API.
- fcose with `randomize: false` is required for incremental runs; certain quality/randomize combinations crash in `relocateComponent`.

**Current use:** fcose default (`numIter` capped by node count), cola as an alternative batch layout with `maxSimulationTime` cap.

### 2. Cola "infinite" / continuous mode (rejected for Animate)

**Model:** cytoscape-cola wraps [WebCola](https://github.com/tgdavis/Jason-Dashboard) constraint layout; `infinite: true` keeps ticking inside cola's animation loop.

**Why it was abandoned for live physics:**

| Subtlety | Effect |
|----------|--------|
| Finite simulation by default | Even with `maxSimulationTime: 60000`, cola **stops on convergence** — motion dies in seconds, not tens of seconds |
| Restart = new attractor | Calling `layout.run()` again reinitialises cola's internal state; velocities and multipliers reset → **different final layout** |
| `handleDisconnected` | Separate component-packing pass → **large teleports** for orphan nodes |
| `avoidOverlap` vs drag | Overlap constraints fight dragged nodes; fixing via `node.scratch('cola')` pinning is fragile and still required restart on release when sim had stopped |
| Pin via scratch | `fixed`, `x`, `y`, `px`, `py` on cola scratch works but ties interaction logic to cola's internals; unpin + restart still jolted other nodes |
| Click jolt | `grab`/`free` without movement still interacted with layout lifecycle unless carefully filtered (`nodesActuallyMoved`) |

**Residual value:** cola remains a **batch layout option** (`Animate (cola)` in the dropdown) for users who want cola's animated settle, not for the Animate toggle.

### 3. Custom force simulation (current Animate implementation)

**Model:** `GraphPhysicsSimulation` in `lib/graph-physics.ts` — explicit forces integrated with damped semi-implicit Euler, one step per frame.

**Forces (Obsidian-like triad):**

1. **Central gravity** — linear pull toward the **current centroid** of all childless nodes (translation-invariant compaction, not a fixed origin).
2. **Link attraction** — linear spring per edge: `F = linkStrength × (distance − linkDistance)`.
3. **Node repulsion** — inverse-square pairwise repulsion between all childless nodes: `F = repulsion / distance²` (with `minSeparation` floor).
4. **Group containers** (`graph-groups.ts`, driven by `data('groupIds')`) — see [Group containers](#group-containers) below.

**Integration:**

```
v ← (v + F) × damping        // damping = 0.5 → steady drift speed ≈ F at equilibrium
v ← clamp(v, maxVelocity)
position ← position + v
```

**Why this satisfies the goals:**

- **Persistent state:** velocities live in a `Map` on the simulation instance; `stop()` only cancels the rAF loop.
- **Deterministic:** no `Math.random()`; coincident nodes separate along a hash-derived angle from node ids.
- **Pin without restart:** pinned nodes are skipped in the integrator but their **live** `node.position()` still participates in force calculation each tick.
- **Sleep/wake:** sim stops scheduling frames when average speed &lt; `restSpeed` for `restTicks` consecutive frames; `pin`, `unpin`, `start()` call `wake()`.
- **Orphans:** all `:childless` nodes enter the force loops; edges only add springs where they exist.

---

## Group containers

Compound rectangles are **not** integrated directly — cytoscape derives their boxes from child positions. Container logic lives in `lib/graph-groups.ts` and is shared by **batch layout post-pass** and **live physics**.

### Data model: `groupIds`

Each leaf node may carry `data('groupIds')`: the containers it belongs to.

| Grouping mode | `groupIds` | Overlap rule |
|---------------|------------|--------------|
| Folder path / parent folder | `[compound:…]` — exactly one | Disjoint folders always separated |
| Tags (overlapping) | `[tag:a, tag:b, …]` — one or more | Containers sharing a node **may** overlap |

The **first** group id (sorted) is also the node's rendered `parent` compound so the dashed box still draws. Physics uses **all** memberships.

### When separation runs

1. **After every batch layout** (cola, fcose, …) when Compound is on — `resolveGroupContainerOverlaps()` in the controller's `layoutstop` handler.
2. **Every Animate tick** — `applyGroupForces()` (cohesion, disjoint-group separation, node↔foreign-container repulsion).

Cola's built-in `avoidOverlap` only affects **leaf nodes**, not compound bounding boxes, and knows nothing about `groupIds`. That is why the post-pass exists.

When **Animate is on**, batch cola is capped at **800 ms** (`maxSimulationTime`) so it only rough-places the graph; the custom physics sim (not cola) drives long convergence. If cola is allowed to fully settle first, Animate appears to stop after a second or two because there is nothing left for physics to do.

### Shared-node smarts

For each pair of groups **A** and **B**:

- If **no node** lists both A and B in `groupIds` → **push apart** (AABB overlap → separation force / batch nudge).
- If **some node** belongs to both → **do not separate**. Cohesion pulls that node toward both centroids, so the containers overlap around the shared bridge node. More shared tags → more overlap.

Deterministic: group iteration order is sorted; coincident centroids use a hash-derived push axis.

### Node ↔ foreign container repulsion

Each leaf repels from group boxes it does **not** belong to (and members of that group feel the equal opposite push). A node inside another group's box is pushed out along the nearest axis; a node near the box edge is pushed to maintain `containerMinGap` clearance. Groups that share the node via `groupIds` are excluded — the shared bridge case still allows overlap between those containers.

### Cola + compound config

When Compound is on, cola batch uses:

- `avoidOverlap: true` — leaf spacing
- `handleDisconnected: false` — avoid teleport-packing components that fight group separation
- Longer `maxSimulationTime` — more time to settle before the post-pass
- Post-pass in `graph-groups.ts` — container boxes for **disjoint** groups

---

## File map

| File | Responsibility |
|------|----------------|
| `components/GraphView.svelte` | Mounts controller, wires Animate toggle, queues slice sync |
| `lib/graph-cy-controller.ts` | Lifecycle FSM, batch layout runs, physics start/stop, drag pin/unpin |
| `lib/graph-physics.ts` | Continuous simulation — forces, integration, sleep/wake |
| `lib/graph-groups.ts` | Shared group container constraints (batch post-pass + physics) |
| `lib/graph-cytoscape.ts` | Layout configs, stylesheet, element builders, `isForceDirectedLayout` |
| `lib/graph-cy-elements.ts` | Incremental element diff (preserve positions on non-structural sync) |
| `lib/graph-cy-interactions.ts` | cytoscape event → handler mapping (tap, grab, drag, free) |

---

## Lifecycle state machine

```
uninitialized → init() → idle
idle ↔ syncing → layouting → idle
layouting → physics   (Animate on + force-directed layout, after layoutstop or settleAfterSync)
physics → idle        (Animate off — physics paused, state retained)
layouting → idle      (Animate off, or non-force-directed layout)
```

**Generation tokens:** `syncGeneration` / `activeSyncGeneration` cancel stale `layoutstop` callbacks when the slice changes mid-layout.

**When physics starts:**

- After batch `layoutstop` if Animate is on → `startPhysics(generation, freshPositions: true)` (velocities cleared — layout teleported nodes).
- After non-structural sync if Animate is on → `startPhysics(generation)` (velocities preserved).
- User enables Animate while idle → `startPhysics` without clearing velocities.

**When physics pauses (not destroys):**

- Animate toggled off → `stopPhysics()` only.
- `syncSlice` / `setLayoutId` / `requestLayout` → pause before layout work.
- Controller `destroy()` → stop and discard simulation instance.

**When velocities are cleared (`resetVelocities`):**

- Only via `startPhysics(..., freshPositions: true)` after a batch layout.
- **Not** on drag, click, Animate toggle, or non-structural sync.

---

## Interaction subtleties

These details are easy to break accidentally.

### Click vs drag

cytoscape fires `grab` on mousedown and `free` on mouseup even for a click. The controller tracks `nodesActuallyMoved` (set on `drag`, cleared on `grab`):

| Event sequence | `wasMoved` on `free` | Physics behaviour |
|----------------|----------------------|-------------------|
| Click (grab → free, no drag) | false | `unpin(id, atRest: false)` — **velocity preserved** |
| Drag (grab → drag → free) | true | `unpin(id, atRest: true)` — **velocity zeroed** for released node |

Without this distinction, every click would zero velocity and feel like a micro-jolt, or every click would restart physics.

### Drag during live physics

1. `grab` → `physics.pin(nodeId)` — integrator stops writing to that node.
2. cytoscape moves the node with the pointer (`drag` events); simulation reads its position each tick for forces on **other** nodes.
3. `free` → `physics.unpin(nodeId, wasMoved)` — node rejoins simulation at release position.
4. Simulation **never** stops or restarts for drag; sleep is suppressed while `pinnedNodes.size > 0`.

### Drag when Animate is off

- `userPositionedNodes` records manual positions.
- Batch re-layout passes them as `fixedNodeConstraint` (fcose) so relayout respects user pins.
- Live physics pin API is not used.

### Selection

`selectNode` / tap handlers only change cytoscape selection state. They do **not** touch the simulation.

---

## Batch layout configuration reference

Configured in `getLayoutConfig()` (`graph-cytoscape.ts`).

### fcose (default)

| Option | Value | Notes |
|--------|-------|-------|
| `randomize` | `false` | Required for stable incremental runs |
| `quality` | `'draft'` | Faster; `draft` + `randomize: false` avoids fcose crash |
| `packComponents` / `tile` | `false` | Avoid extra component packing |
| `nodeRepulsion` | `8000` | |
| `idealEdgeLength` | `100` | |
| `numIter` | `min(40–48, 20 + nodeCount)` | Scales with graph size, capped |
| `animate` | `false` | Positions applied immediately; Animate handles motion afterward |

### cola (batch only)

| Option | Compound off | Compound on | Animate on |
|--------|--------------|---------------|------------|
| `maxSimulationTime` | `min(2500, …)` | `min(4000, …)` | **800 ms** (rough place only) |
| `centerGraph` | `true` | `true` | **`false`** (avoid re-centering after physics handoff) |
| `avoidOverlap` | `true` | `true` | Leaf spacing only |
| `handleDisconnected` | `true` | **`false`** | Avoid teleport-packing that fights container separation |
| `nodeSpacing` | `12` | `18` | Slightly roomier when grouped |
| `randomize` | `false` | `false` | |

Container boxes: `resolveGroupContainerOverlaps()` after `layoutstop` (see [Group containers](#group-containers)).

### cose

Included in `isForceDirectedLayout` so Animate works after cose batch settle. Uses built-in cose with capped `numIter`.

---

## Live physics configuration reference

All tunables live in `DEFAULT_PHYSICS_SETTINGS` (`graph-physics.ts`).

```typescript
{
    gravity: 0.002,        // centroid pull, px/tick per px offset
    repulsion: 20000,      // inverse-square constant
    linkStrength: 0.015,   // spring stiffness
    linkDistance: 120,     // spring rest length (px)
    damping: 0.5,          // velocity retention per tick
    maxVelocity: 10,       // stability clamp (px/tick)
    minSeparation: 24,     // repulsion distance floor (px)
    restSpeed: 0.02,
    restTicks: 90,
    padding: 18,
    cohesion: 0.012,
    separationStrength: 0.05,
    batchMaxIterations: 48,
    batchSeparationScale: 0.55
}
```

Group settings are in `DEFAULT_GROUP_SETTINGS` (`graph-groups.ts`); physics extends them via `GraphPhysicsSettings`.

### Tuning intuition

With `damping = 0.5`, steady-state drift speed under constant force `F` is approximately `F` px/tick (because `v = F × d / (1 − d)` → `F` when `d = 0.5`).

- **Springs** (`linkStrength`, `linkDistance`): local structure forms in ~1 s.
- **Gravity** (`gravity`): global compaction over ~8–10+ s — this is what makes Animate feel "long".
- **Repulsion** (`repulsion`, `minSeparation`): node spacing; linked pairs settle ~1.4× `linkDistance` once repulsion balances springs.
- **Sleep** (`restSpeed`, `restTicks`): saves CPU when settled; any interaction wakes the loop.

To expose settings in UI later, thread a `GraphPhysicsSettings` partial through `GraphCyController` into `GraphPhysicsSimulation`'s constructor — the interface is already exported.

---

## Performance notes

- **Live physics:** O(n²) repulsion per frame over childless nodes. Fine for typical slice caps (~120 nodes); if truncation limits rise, consider Barnes–Hut, spatial hashing, or limiting repulsion to neighbours within a radius.
- **Batch layout:** fcose/cola block the webview main thread. Iteration caps in `getLayoutConfig` intentionally scale with `nodeCount` (see `graphical_graph.rq` `webview_threading`).
- **Element diff:** `graph-cy-elements.ts` avoids full graph rebuilds so positions survive non-structural filter/sync updates.
- **Graph mount:** GraphView mounts only while the graph tab is visible — do not keep cytoscape alive under `display: none` (zero-size container breaks init).

---

## Anti-patterns (do not reintroduce)

1. **Using cola (or any layout) for the Animate toggle** — restarts change the attractor; convergence is too fast; disconnected handling teleports; drag pinning via scratch is brittle.

2. **Calling `layout.run()` on every drag release** — resets all velocities → visible jolt, breaks deterministic continuation.

3. **Stopping live physics on `grab`** — freezes the graph while the user holds a node; violates "continuous during drag".

4. **Restarting physics on click** — filter with `nodesActuallyMoved` before treating `free` as a drag end.

5. **Clearing velocities on Animate toggle or sync** — toggle should pause/resume; only batch layout should call `resetVelocities`.

6. **Enabling fcose `randomize: true` with incremental runs** — known crash in fcose `relocateComponent`.

7. **Treating layout dropdown "cola" and Animate toggle as the same thing** — dropdown = batch algorithm; Animate = custom simulation layered on top of whichever force-directed batch layout ran last.

---

## Future development checklist

When changing graph physics or layout behaviour, verify:

- [ ] Enable Animate on a 30+ node graph — motion continues &gt; 10 s before sleep.
- [ ] Toggle Animate off, wait, on — graph resumes and converges without a global jump.
- [ ] Click a node repeatedly — no simulation restart or jitter.
- [ ] Drag a node, release — node stays at release point; neighbours keep moving smoothly.
- [ ] Hold a node 5+ s while sim would have slept — other nodes still react.
- [ ] Graph with disconnected nodes — orphans drift and repel, no teleport packs.
- [ ] Change layout dropdown (fcose ↔ cola) with Animate on — batch settle then live physics handoff.
- [ ] Structural sync (add/remove node) — batch layout runs, then physics with fresh velocities.
- [ ] Non-structural sync (label/color change) — positions preserved, physics continues if Animate on.

Planned product work (from requirements, not yet implemented): user-facing physics presets menu (`physics_options` in `.rq`), possibly mapping to `GraphPhysicsSettings` overrides.

---

## Quick API reference

### GraphCyController

| Method | Effect on physics |
|--------|-------------------|
| `setAnimatePhysics(true)` | Resume/start simulation if force-directed layout |
| `setAnimatePhysics(false)` | Pause simulation (state kept) |
| `setLayoutId(id)` | Stop physics, run new batch layout |
| `requestLayout()` | Clear user pins, stop physics, batch relayout |
| `syncSlice(...)` | Pause physics, diff elements, maybe batch layout, maybe resume physics |

### GraphPhysicsSimulation

| Method | Effect |
|--------|--------|
| `start()` | Begin/resume rAF loop |
| `stop()` | Cancel rAF loop; keep velocities and pins |
| `wake()` | Reset calm counter; schedule tick if active |
| `pin(id)` | Exclude node from integration; include in forces |
| `unpin(id, atRest)` | Reintegrate node; optionally zero its velocity |
| `resetVelocities()` | Clear all velocities (post-batch-layout only) |
| `prune(validIds)` | Drop state for removed nodes |

---

## Related reading

- Cytoscape layouts: https://js.cytoscape.org/#layouts
- fcose extension: https://github.com/iVis-at-Bilkent/cytoscape.js-fcose
- cola extension: https://github.com/cytoscape/cytoscape-cola
- Implementation comments in `graph-physics.ts` and `graph-cy-controller.ts` (kept in sync with this doc when behaviour changes)
