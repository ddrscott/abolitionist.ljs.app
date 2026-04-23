import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  Handle,
  MarkerType,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '@/styles/journey-map.css';

// ============================================================================
// DATA — a reader-journey map of every sticking point the corpus addresses.
//
// Organized as:
//   Start                            ← one node
//   ↓
//   7 entry positions                ← where a reader might stand today
//   ↓
//   6 gates + 1 gospel gate          ← decision points each path traverses
//     each gate has 3-7 sub-objections (the "sticking points")
//   ↓
//   Faithful Abolitionist (terminal) + 7 action nodes fanning out
//   ↓
//   Gospel Precedes Abolition (terminal) for the P7 branch
//
// Expand/collapse state is per-gate. Mobile default: all collapsed.
// Desktop default: all expanded.
//
// Adding a sticking point: add to the relevant gate's `objections` array
// (id, label, href). No layout math needed — positions compute from the
// GRID constants.
// ============================================================================

const GRID = {
  colStep: 180,
  rowStart: 0,
  rowEntries: 180,
  rowGate1: 400,
  rowGateStep: 300,
  // Distance from the trunk center (trunkX) to where the objection
  // column starts on each side. Gate node is ~260 wide; this puts the
  // objections well outside with a comfortable reading gap.
  objRightStart: 230,
  objLeftStart: 230,
  objRowStep: 66,
  // Gospel gate sits to the right of the main trunk at the SAME
  // y-baseline as Gate 1 — visually a sibling, not an afterthought.
  gospelOffsetX: 720,
};

type Position = {
  id: string;
  col: number;
  label: string;
  href: string;
};

const POSITIONS: Position[] = [
  { id: 'P1', col: 0, label: 'I support legal\nabortion', href: '/pages/journey/path-secular-pro-choice/' },
  { id: 'P2', col: 1, label: "I'm a Christian\nbut pro-choice", href: '/pages/journey/path-christian-pro-choice/' },
  { id: 'P3', col: 2, label: 'Personally opposed,\nnot illegal', href: '/pages/journey/path-personally-opposed/' },
  { id: 'P4', col: 3, label: 'Pro-life\nwith exceptions', href: '/pages/journey/path-pro-life-with-exceptions/' },
  { id: 'P5', col: 4, label: 'Pro-life\nincrementalist', href: '/pages/journey/path-pro-life-incrementalist/' },
  { id: 'P6', col: 5, label: 'Believes wrong,\nnot acting', href: '/pages/journey/path-apathetic-christian/' },
  { id: 'P7', col: 6, label: 'Anti-abortion,\nnot Christian', href: '/pages/journey/path-anti-abortion-non-christian/' },
];

type Objection = {
  id: string;
  label: string;
  href: string;
};

type Gate = {
  id: string;
  order: number; // 0-based vertical position in the main trunk
  question: string;
  objections: Objection[];
};

const GATES: Gate[] = [
  {
    id: 'G1',
    order: 0,
    question: 'Is abortion the unjust killing of a human being?',
    objections: [
      { id: 'O1a', label: "'It's just a clump\nof cells'", href: '/pages/abolitionistsrising.com/faq/' },
      { id: 'O1b', label: "'Human, but\nnot a person yet'", href: '/pages/abolitionistsrising.com/faq/' },
      { id: 'O1c', label: "'Viability /\nheartbeat / sentience\nis the line'", href: '/pages/abolitionistsrising.com/faq/' },
      { id: 'O1d', label: "'My body,\nmy choice'", href: '/pages/abolitionistsrising.com/faq/' },
      { id: 'O1e', label: "'Forced birth = forced\norgan donation'", href: '/pages/abolitionistsrising.com/faq/' },
      { id: 'O1f', label: "'Ban will cause\nback-alley deaths'", href: '/pages/abolitionistsrising.com/faq/' },
    ],
  },
  {
    id: 'G2',
    order: 1,
    question: 'By what authority do you decide?',

    objections: [
      { id: 'O2a', label: "'You can't\nlegislate morality'", href: '/pages/abolitionistsrising.com/faq/' },
      { id: 'O2b', label: "'That's a\nreligious view'", href: '/pages/abolitionistsrising.com/faq/' },
      { id: 'O2c', label: "'Bible doesn't\nmention abortion'", href: '/pages/abolitionistsrising.com/theology/' },
      { id: 'O2d', label: "'Exodus 21:22 says\nfetus = property'", href: '/pages/abolitionistsrising.com/theology/' },
      { id: 'O2e', label: "'Majority should\ndecide'", href: '/pages/abolitionistsrising.com/biblical-not-secular/' },
      { id: 'O2f', label: "'Pragmatism —\nwhat saves more babies'", href: '/pages/abolitionistsrising.com/biblical-not-secular/' },
    ],
  },
  {
    id: 'G3',
    order: 2,
    question: "Is 'less iniquity' acceptable?",

    objections: [
      { id: 'O3a', label: "'Heartbeat bills\nsave some babies'", href: '/pages/abolitionistsrising.com/immediatism/' },
      { id: 'O3b', label: "'Abolition is\npolitically impossible'", href: '/pages/abolitionistsrising.com/immediatism/' },
      { id: 'O3c', label: "'Wilberforce was\nincremental'", href: '/pages/abolitionistsrising.com/abolitionist-not-pro-life/' },
      { id: 'O3d', label: "Kristan Hawkins'\n'save as many\nas possible'", href: '/pages/abolitionistsrising.com/kristan-hawkins-flawed-reasoning-vs-scripture/' },
      { id: 'O3e', label: "'SBC seminary\nprofs endorse\ngradualism'", href: '/pages/freethestates.org/against-pro-life-compromise-responding-to-denny-burk-andrew-walker-et-al/' },
    ],
  },
  {
    id: 'G4',
    order: 3,
    question: 'Are exceptions acceptable?',

    objections: [
      { id: 'O4a', label: "'What about rape?'", href: '/pages/abolitionistsrising.com/no-exceptions/' },
      { id: 'O4b', label: "'What about incest?'", href: '/pages/abolitionistsrising.com/no-exceptions/' },
      { id: 'O4c', label: "'Fetal abnormality\n/ disability?'", href: '/pages/abolitionistsrising.com/no-exceptions/' },
      { id: 'O4d', label: "'Mother's life\n(ectopic, etc.)?'", href: '/pages/abolitionistsrising.com/no-exceptions/' },
      { id: 'O4e', label: "'Don't punish\nthe mother'", href: '/pages/abolitionistsrising.com/criminalization/' },
    ],
  },
  {
    id: 'G5',
    order: 4,
    question: 'Is belief without action sufficient?',

    objections: [
      { id: 'O5a', label: "'It's not my\ncalling / gift'", href: '/pages/freethestates.org/all-about-the-church/' },
      { id: 'O5b', label: "'Pro-life orgs\nhandle this'", href: '/pages/abolitionistsrising.com/abolitionist-not-pro-life/' },
      { id: 'O5c', label: "'Prayer alone\nis enough'", href: '/pages/abolitionistsrising.com/stay-steeped-in-prayer-as-you-seek-to-abolish-abortion/' },
      { id: 'O5d', label: "'Too divisive\nfor my church'", href: '/pages/freethestates.org/all-about-the-church/' },
      { id: 'O5e', label: "'I donate /\nvote pro-life'", href: '/pages/abolitionistsrising.com/fruits-of-abolitionism-is-true-repentance-necessary/' },
    ],
  },
  {
    id: 'G6',
    order: 5,
    question: 'How does action manifest?',

    objections: [
      { id: 'A1', label: 'Prayer', href: '/pages/abolitionistsrising.com/stay-steeped-in-prayer-as-you-seek-to-abolish-abortion/' },
      { id: 'A2', label: 'Repentance', href: '/pages/abolitionistsrising.com/fruits-of-abolitionism-is-true-repentance-necessary/' },
      { id: 'A3', label: 'Church\nengagement', href: '/pages/freethestates.org/all-about-the-church/' },
      { id: 'A4', label: 'Engage\nmagistrates', href: '/pages/abolitionistsrising.com/biblical-not-secular/' },
      { id: 'A5', label: 'Consistent\nvoting', href: '/pages/abolitionistsrising.com/how-shall-an-abolitionist-vote/' },
      { id: 'A6', label: 'Preach at\nkilling centers', href: '/pages/journey/next-steps/' },
      { id: 'A7', label: 'Sign the\nNorman Statement', href: '/pages/abolitionistsrising.com/norman-statement/' },
    ],
  },
];

const GOSPEL_GATE = {
  id: 'GG',
  question: 'The gospel must precede abolition.',
  objections: [
    { id: 'OG1', label: "'Can I partner as\na non-Christian?'", href: '/pages/abolitionistsrising.com/faq/' },
    { id: 'OG2', label: "'Why must it\nbe Christian?'", href: '/pages/abolitionistsrising.com/faq/' },
    { id: 'OG3', label: "'What is\nthe gospel?'", href: '/pages/abolitionistsrising.com/theology/' },
  ],
};

/** Which gate each starting position first lands on. Reflects the user's
 *  earliest sticking point: someone who denies the preborn is human enters
 *  at G1; a Christian pro-choice reader already accepts humanity but contests
 *  authority (G2); a pro-life-with-exceptions reader accepts everything up
 *  through G3 and is stuck at G4; etc. P7 enters the gospel gate directly. */
const POSITION_TO_FIRST_GATE: Record<string, string> = {
  P1: 'G1',
  P2: 'G2',
  P3: 'G1',
  P4: 'G4',
  P5: 'G3',
  P6: 'G5',
  P7: 'GG',
};

// ============================================================================
// CUSTOM NODE COMPONENTS
// ============================================================================

type StartData = { label: string };
type PositionData = { label: string; href: string };
type GateData = { label: string; expanded: boolean; onToggle: () => void };
type ObjectionData = { label: string; href: string };
type TerminalData = { label: string; href?: string; variant: 'abolition' | 'gospel' };

function StartNode({ data }: NodeProps<Node<StartData>>) {
  return (
    <div className="jm-node jm-start">
      <Handle type="source" position={Position.Bottom} id="b" />
      {/* Target handle for the T_GOSPEL loopback — "after conversion,
          re-enter the map". */}
      <Handle type="target" position={Position.Top} id="t" />
      {data.label}
    </div>
  );
}

function PositionNode({ data }: NodeProps<Node<PositionData>>) {
  return (
    <a href={data.href} className="jm-node jm-position" title={`Read the ${data.label.replace('\n', ' ')} path`}>
      <Handle type="target" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <span>{data.label}</span>
    </a>
  );
}

function GateNode({ data }: NodeProps<Node<GateData>>) {
  return (
    <div className="jm-node jm-gate">
      <Handle type="target" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="source" position={Position.Left} id="l" />
      <button type="button" onClick={data.onToggle} aria-expanded={data.expanded}>
        {data.label}
        <span className="jm-toggle" aria-hidden="true">{data.expanded ? '−' : '+'}</span>
      </button>
    </div>
  );
}

function ObjectionNode({ data }: NodeProps<Node<ObjectionData>>) {
  return (
    <a href={data.href} className="jm-node jm-objection" title="Read the article that answers this">
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="target" position={Position.Right} id="r" />
      <span>{data.label}</span>
    </a>
  );
}

function TerminalNode({ data }: NodeProps<Node<TerminalData>>) {
  const cls = `jm-node jm-terminal jm-terminal-${data.variant}`;
  return data.href ? (
    <a href={data.href} className={cls}>
      <Handle type="target" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <span>{data.label}</span>
    </a>
  ) : (
    <div className={cls}>
      <Handle type="target" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <span>{data.label}</span>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  start: StartNode,
  position: PositionNode,
  gate: GateNode,
  objection: ObjectionNode,
  terminal: TerminalNode,
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

type Vec2 = { x: number; y: number };

/** Edit mode is triggered by visiting the page with `?edit=1`. In that
 *  mode, nodes become draggable and an Export panel appears so the
 *  layout can be tuned by hand and committed back to the repo. */
function useIsEditing() {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setEditing(new URLSearchParams(window.location.search).has('edit'));
  }, []);
  return editing;
}

/** Any positions in `web/public/journey-layout.json` are treated as
 *  authoritative overrides on top of the auto-computed ones. Empty
 *  object (or 404) means "use the computed layout". */
function useSavedPositions() {
  const [saved, setSaved] = useState<Record<string, Vec2>>({});
  useEffect(() => {
    fetch('/journey-layout.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        if (data && typeof data === 'object') setSaved(data);
      })
      .catch(() => {});
  }, []);
  return saved;
}

export function JourneyMap() {
  const isEditing = useIsEditing();
  const savedPositions = useSavedPositions();

  // Drag overrides recorded in this session (take precedence over saved
  // file; persist across collapse/expand toggles).
  const [userPositions, setUserPositions] = useState<Record<string, Vec2>>({});

  // Initial collapse state: all collapsed on mobile, all expanded on desktop.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    return window.innerWidth < 768
      ? new Set([...GATES.map((g) => g.id), GOSPEL_GATE.id])
      : new Set();
  });

  const toggleGate = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Priority: in-session drag → saved file → auto-computed position. */
  const overrideFor = useCallback(
    (id: string, fallback: Vec2): Vec2 =>
      userPositions[id] ?? savedPositions[id] ?? fallback,
    [userPositions, savedPositions],
  );

  const onNodeDragStop = useCallback((_event: unknown, node: Node) => {
    setUserPositions((prev) => ({ ...prev, [node.id]: node.position }));
  }, []);

  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const trunkX = Math.round(((POSITIONS.length - 1) * GRID.colStep) / 2);

    // Start node
    nodes.push({
      id: 'start',
      type: 'start',
      position: overrideFor('start', { x: trunkX, y: GRID.rowStart }),
      data: { label: 'Where are you\nnow?' },
      draggable: isEditing,
    });

    // Entry positions
    for (const p of POSITIONS) {
      nodes.push({
        id: p.id,
        type: 'position',
        position: overrideFor(p.id, { x: p.col * GRID.colStep, y: GRID.rowEntries }),
        data: { label: p.label, href: p.href },
        draggable: isEditing,
      });
      edges.push({
        id: `start-${p.id}`,
        source: 'start',
        sourceHandle: 'b',
        target: p.id,
        targetHandle: 't',
        type: 'smoothstep',
        style: { stroke: '#C49A6E', strokeWidth: 1.5 },
      });
    }

    // Gates + objections
    for (const g of GATES) {
      const gy = GRID.rowGate1 + g.order * GRID.rowGateStep;
      nodes.push({
        id: g.id,
        type: 'gate',
        position: overrideFor(g.id, { x: trunkX, y: gy }),
        data: {
          label: g.question,
          expanded: !collapsed.has(g.id),
          onToggle: () => toggleGate(g.id),
        },
        draggable: isEditing,
      });

      if (!collapsed.has(g.id)) {
        // Split the objections half-and-half across the two sides of the
        // trunk. Balanced composition beats the old alternating-side
        // approach, which made every other gate feel lopsided.
        const half = Math.ceil(g.objections.length / 2);
        const rightCount = half;
        const leftCount = g.objections.length - half;
        g.objections.forEach((o, i) => {
          const onRight = i < rightCount;
          const sideIndex = onRight ? i : i - rightCount;
          const sideCount = onRight ? rightCount : leftCount;
          const x = onRight
            ? trunkX + GRID.objRightStart
            : trunkX - GRID.objLeftStart - 200;
          const yOffset = (sideIndex - (sideCount - 1) / 2) * GRID.objRowStep;
          nodes.push({
            id: o.id,
            type: 'objection',
            position: overrideFor(o.id, { x, y: gy + yOffset }),
            data: { label: o.label, href: o.href },
            draggable: isEditing,
          });
          edges.push({
            id: `${g.id}-${o.id}`,
            source: g.id,
            sourceHandle: onRight ? 'r' : 'l',
            target: o.id,
            targetHandle: onRight ? 'l' : 'r',
            type: 'smoothstep',
            // Anchor "no" label on the first objection of each side so the
            // flowchart semantic reads clearly whichever way the eye moves.
            label: sideIndex === 0 ? 'no' : undefined,
            labelStyle: { fontSize: 10, fill: '#CC3206', fontWeight: 700 },
            labelBgStyle: { fill: '#FFFFFF' },
            style: { stroke: '#CC3206', strokeWidth: 1, strokeDasharray: '4 3' },
          });
        });
      }
    }

    // Trunk edges (gate-to-gate) — labeled "yes" to carry the flowchart
    // semantic: "yes, I agree with this gate's answer, continue".
    for (let i = 0; i < GATES.length - 1; i++) {
      edges.push({
        id: `${GATES[i].id}-${GATES[i + 1].id}`,
        source: GATES[i].id,
        sourceHandle: 'b',
        target: GATES[i + 1].id,
        targetHandle: 't',
        type: 'smoothstep',
        label: 'yes',
        labelStyle: { fontSize: 12, fill: '#430607', fontWeight: 700 },
        labelBgStyle: { fill: '#FFFFFF', fillOpacity: 0.95 },
        labelBgPadding: [4, 2],
        style: { stroke: '#430607', strokeWidth: 2.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#430607', width: 18, height: 18 },
      });
    }

    // Position → first-gate edges (where each starter "enters" the trunk)
    for (const [pId, gateId] of Object.entries(POSITION_TO_FIRST_GATE)) {
      edges.push({
        id: `${pId}-${gateId}`,
        source: pId,
        sourceHandle: 'b',
        target: gateId,
        targetHandle: 't',
        type: 'smoothstep',
        style: { stroke: '#430607', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#430607', width: 14, height: 14 },
      });
    }

    // Gospel gate (off to the right of the main trunk)
    const gospelY = GRID.rowGate1;
    // Gospel gate sits to the right of the main trunk at the same y as
    // Gate 1 — visually a sibling branch, not an orphan.
    const gospelX = trunkX + GRID.gospelOffsetX;
    nodes.push({
      id: GOSPEL_GATE.id,
      type: 'gate',
      position: overrideFor(GOSPEL_GATE.id, { x: gospelX, y: gospelY }),
      data: {
        label: GOSPEL_GATE.question,
        expanded: !collapsed.has(GOSPEL_GATE.id),
        onToggle: () => toggleGate(GOSPEL_GATE.id),
      },
      draggable: isEditing,
    });

    if (!collapsed.has(GOSPEL_GATE.id)) {
      GOSPEL_GATE.objections.forEach((o, i) => {
        nodes.push({
          id: o.id,
          type: 'objection',
          position: overrideFor(o.id, {
            x: gospelX + GRID.objRightStart,
            y: gospelY + (i - 1) * GRID.objRowStep,
          }),
          data: { label: o.label, href: o.href },
          draggable: isEditing,
        });
        edges.push({
          id: `${GOSPEL_GATE.id}-${o.id}`,
          source: GOSPEL_GATE.id,
          sourceHandle: 'r',
          target: o.id,
          targetHandle: 'l',
          type: 'smoothstep',
          style: { stroke: '#CC3206', strokeWidth: 1, strokeDasharray: '4 3' },
        });
      });
    }

    // Terminals
    const abolitionY = GRID.rowGate1 + (GATES.length - 1) * GRID.rowGateStep + 180;
    nodes.push({
      id: 'T_FA',
      type: 'terminal',
      position: overrideFor('T_FA', { x: trunkX, y: abolitionY }),
      data: {
        label: 'Faithful Abolitionist\nimmediate · total · biblical · active',
        href: '/pages/journey/next-steps/',
        variant: 'abolition',
      },
      draggable: isEditing,
    });
    edges.push({
      id: `${GATES[GATES.length - 1].id}-T_FA`,
      source: GATES[GATES.length - 1].id,
      sourceHandle: 'b',
      target: 'T_FA',
      targetHandle: 't',
      type: 'smoothstep',
      style: { stroke: '#430607', strokeWidth: 3 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#430607', width: 20, height: 20 },
    });

    const gospelTerminalY = gospelY + 260;
    nodes.push({
      id: 'T_GOSPEL',
      type: 'terminal',
      position: overrideFor('T_GOSPEL', { x: gospelX, y: gospelTerminalY }),
      data: {
        label: 'The gospel\nprecedes abolition',
        variant: 'gospel',
      },
      draggable: isEditing,
    });
    edges.push({
      id: `${GOSPEL_GATE.id}-T_GOSPEL`,
      source: GOSPEL_GATE.id,
      sourceHandle: 'b',
      target: 'T_GOSPEL',
      targetHandle: 't',
      type: 'smoothstep',
      label: 'yes',
      labelStyle: { fontSize: 12, fill: '#430607', fontWeight: 700 },
      labelBgStyle: { fill: '#FFFFFF', fillOpacity: 0.95 },
      labelBgPadding: [4, 2],
      style: { stroke: '#430607', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#430607', width: 18, height: 18 },
    });
    // After conversion, re-enter the map at Start
    edges.push({
      id: 'T_GOSPEL-start',
      source: 'T_GOSPEL',
      sourceHandle: 'b',
      target: 'start',
      targetHandle: 't',
      type: 'smoothstep',
      label: 'after conversion, re-enter',
      labelStyle: { fontSize: 11, fill: '#430607' },
      labelBgStyle: { fill: '#FFFFFF', fillOpacity: 0.9 },
      labelBgPadding: [4, 2],
      style: { stroke: '#430607', strokeWidth: 1, strokeDasharray: '6 4' },
    });

    return { nodes, edges };
  }, [collapsed, toggleGate, isEditing, overrideFor]);

  const exportLayout = useCallback(() => {
    // Grab EVERY node's current position (computed + overrides + drags)
    // so the exported JSON is a complete, self-contained layout the
    // next page load can use as-is.
    const positions: Record<string, Vec2> = {};
    for (const n of nodes) positions[n.id] = n.position;
    const blob = new Blob([JSON.stringify(positions, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'journey-layout.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes]);

  const resetLayout = useCallback(() => {
    setUserPositions({});
  }, []);

  return (
    <div className="jm-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: '#430607', strokeWidth: 2 },
        }}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={isEditing}
        nodesConnectable={false}
        edgesFocusable={false}
        preventScrolling={false}
        onNodeDragStop={isEditing ? onNodeDragStop : undefined}
      >
        <Background color="#C49A6E" gap={28} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            if (n.type === 'gate') return '#430607';
            if (n.type === 'terminal') return '#430607';
            if (n.type === 'position') return '#F8F2ED';
            if (n.type === 'objection') return '#FFFFFF';
            return '#FFFFFF';
          }}
          nodeStrokeColor="#C49A6E"
          maskColor="rgba(67, 6, 7, 0.12)"
        />
        {isEditing && (
          <Panel position="top-right" className="jm-editor-panel">
            <strong>Layout editor</strong>
            <p>
              Drag nodes into place. Click export — save the file as
              <code>web/public/journey-layout.json</code>. Reload the map
              without <code>?edit=1</code> to verify.
            </p>
            <div className="jm-editor-buttons">
              <button type="button" onClick={exportLayout}>
                Export layout JSON
              </button>
              <button
                type="button"
                onClick={resetLayout}
                className="jm-editor-reset"
              >
                Reset drags
              </button>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
