const notesText = document.querySelector("#notesText");
const syntaxCode = document.querySelector("#syntaxHighlight code");
const traceCode = document.querySelector("#traceCode");
const scratchEditor = document.querySelector(".scratch-editor");
const editorTabsContainer = document.querySelector("#editorTabs");
const addTabButton = document.querySelector("#addTabButton");
const resetButton = document.querySelector("#resetButton");

const runButton = document.querySelector("#runScratchButton");
const visualizeButton = document.querySelector("#visualizeScratchButton");
const exitTutorButton = document.querySelector("#exitTutorButton");

const tutorPanel = document.querySelector("#tutorPanel");
const idlePanel = document.querySelector("#idlePanel");
const tutorStepCount = document.querySelector("#tutorStepCount");
const tutorLineLabel = document.querySelector("#tutorLineLabel");
const tutorStatus = document.querySelector("#tutorStatus");
const tutorSlider = document.querySelector("#tutorStepSlider");
const tutorPrev = document.querySelector("#tutorPrevButton");
const tutorNext = document.querySelector("#tutorNextButton");
const tutorNextIter = document.querySelector("#tutorNextIterationButton");
const tutorFirst = document.querySelector("#tutorFirstButton");
const tutorLast = document.querySelector("#tutorLastButton");
const tutorFrames = document.querySelector("#tutorFrames");
const tutorHeap = document.querySelector("#tutorHeap");
const tutorMemoryLayout = document.querySelector("#tutorMemoryLayout");
const tutorTreeView = document.querySelector("#tutorTreeView");
const tutorTreeLegend = document.querySelector("#tutorTreeLegend");
const tutorTreeCanvas = document.querySelector("#tutorTreeCanvas");
const tutorTreeQueues = document.querySelector("#tutorTreeQueues");
const tutorMemoryViewButton = document.querySelector("#tutorMemoryViewButton");
const tutorTreeViewButton = document.querySelector("#tutorTreeViewButton");

const consoleHeading = document.querySelector("#consoleHeading");
const scratchConsole = document.querySelector("#scratchConsole");
const clearScratchConsole = document.querySelector("#clearScratchConsole");

const INITIAL_CODE_TAB_1 = `student = "Bob"
print(student)

# What if we need another student named "Alice"?`;

let pyodidePromise = null;
let tabs = [];
let activeTabId = null;
let tabCounter = 0;

const TRACER_BOOTSTRAP = `
import ast
import collections
import io
import json
import sys
import traceback

MAX_STEPS = 500
MAX_ENCODE_DEPTH = 60
SKIP_NAMES = {
    "__name__", "__doc__", "__package__", "__loader__", "__spec__",
    "__annotations__", "__builtins__", "tutor_trace", "USER_SOURCE"
}

def _tutor_encode(value, heap, depth=0):
    if depth > MAX_ENCODE_DEPTH:
        return {"kind": "primitive", "type": type(value).__name__, "value": "..."}
    if value is None:
        return {"kind": "primitive", "type": "NoneType", "value": "None"}
    if isinstance(value, bool):
        return {"kind": "primitive", "type": "bool", "value": "True" if value else "False"}
    if isinstance(value, int):
        return {"kind": "primitive", "type": "int", "value": str(value)}
    if isinstance(value, float):
        return {"kind": "primitive", "type": "float", "value": repr(value)}
    if isinstance(value, str):
        return {"kind": "primitive", "type": "str", "value": json.dumps(value)}
    if isinstance(value, bytes):
        return {"kind": "primitive", "type": "bytes", "value": repr(value)}
    if callable(value) or isinstance(value, type) or type(value).__name__ == "module":
        return None
    if isinstance(value, (list, tuple, set, frozenset, dict, collections.deque)) or hasattr(value, "__dict__"):
        oid = str(id(value))
        if oid in heap:
            return {"kind": "ref", "id": oid}
        if isinstance(value, dict):
            heap[oid] = {"id": oid, "type": "dict", "entries": []}
            heap[oid]["entries"] = [
                [_tutor_encode(k, heap, depth + 1), _tutor_encode(v, heap, depth + 1)]
                for k, v in value.items()
            ]
            return {"kind": "ref", "id": oid}
        if isinstance(value, (list, tuple, set, frozenset, collections.deque)):
            heap[oid] = {"id": oid, "type": type(value).__name__, "elements": []}
            heap[oid]["elements"] = [_tutor_encode(item, heap, depth + 1) for item in value]
            return {"kind": "ref", "id": oid}
        if hasattr(value, "__dict__"):
            heap[oid] = {"id": oid, "type": type(value).__name__, "attrs": {}}
            attrs = {}
            for key, item in vars(value).items():
                if key.startswith("_"):
                    continue
                encoded = _tutor_encode(item, heap, depth + 1)
                if encoded is not None:
                    attrs[key] = encoded
            heap[oid]["attrs"] = attrs
            return {"kind": "ref", "id": oid}
    return {"kind": "primitive", "type": type(value).__name__, "value": repr(value)[:120]}

def _should_keep_name(name, value):
    if name in SKIP_NAMES or name.startswith("_"):
        return False
    if callable(value) or isinstance(value, type):
        return False
    if type(value).__name__ == "module":
        return False
    return True

def _capture_state(frame):
    heap = {}
    frames = []
    current = frame
    while current is not None and current.f_code.co_filename == "<scratch>":
        name = current.f_code.co_name
        label = "Global frame" if name == "<module>" else f"{name}()"
        locals_map = {}
        for key, value in current.f_locals.items():
            if not _should_keep_name(key, value):
                continue
            encoded = _tutor_encode(value, heap)
            if encoded is not None:
                locals_map[key] = encoded
        frames.append({"name": label, "locals": locals_map})
        current = current.f_back
    frames.reverse()
    return frames, heap

def _loop_headers(source):
    headers = set()
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return headers
    for node in ast.walk(tree):
        if isinstance(node, (ast.For, ast.While)):
            headers.add(node.lineno)
    return headers

def tutor_trace(source):
    steps = []
    headers = _loop_headers(source)
    stdout = io.StringIO()
    truncated = False
    error = None

    try:
        compiled = compile(source, "<scratch>", "exec")
    except SyntaxError as exc:
        return {
            "steps": [{
                "line": exc.lineno or 1,
                "event": "exception",
                "stdout": "",
                "is_loop_header": False,
                "frames": [{"name": "Global frame", "locals": {}}],
                "heap": {},
                "error": f"SyntaxError: {exc.msg}"
            }],
            "loop_headers": sorted(headers),
            "truncated": False
        }

    def tracer(frame, event, arg):
        nonlocal truncated
        if frame.f_code.co_filename != "<scratch>":
            return tracer
        if event != "line":
            return tracer
        if len(steps) >= MAX_STEPS:
            truncated = True
            raise RuntimeError("Stopped after too many steps")
        frames, heap = _capture_state(frame)
        steps.append({
            "line": frame.f_lineno,
            "event": "line",
            "stdout": stdout.getvalue(),
            "is_loop_header": frame.f_lineno in headers,
            "frames": frames,
            "heap": heap,
            "error": None
        })
        return tracer

    old_stdout = sys.stdout
    old_trace = sys.gettrace()
    exec_globals = {"__name__": "__main__"}
    sys.stdout = stdout
    sys.settrace(tracer)
    try:
        exec(compiled, exec_globals)
    except Exception as exc:
        if truncated and type(exc).__name__ == "RuntimeError" and "too many steps" in str(exc):
            pass
        else:
            error = f"{type(exc).__name__}: {exc}"
            frames, heap = ([], {})
            try:
                tb = exc.__traceback__
                while tb is not None and tb.tb_next is not None:
                    tb = tb.tb_next
                if tb is not None and tb.tb_frame.f_code.co_filename == "<scratch>":
                    frames, heap = _capture_state(tb.tb_frame)
            except Exception:
                pass
            steps.append({
                "line": steps[-1]["line"] if steps else 1,
                "event": "exception",
                "stdout": stdout.getvalue(),
                "is_loop_header": False,
                "frames": frames if frames else [{"name": "Global frame", "locals": {}}],
                "heap": heap,
                "error": error
            })
    finally:
        sys.settrace(old_trace)
        sys.stdout = old_stdout

    if error is None:
        final_heap = {}
        final_locals = {}
        for key, value in exec_globals.items():
            if not _should_keep_name(key, value):
                continue
            encoded = _tutor_encode(value, final_heap)
            if encoded is not None:
                final_locals[key] = encoded
        steps.append({
            "line": None,
            "event": "finished",
            "stdout": stdout.getvalue(),
            "is_loop_header": False,
            "frames": [{"name": "Global frame", "locals": final_locals}],
            "heap": final_heap,
            "error": None
        })

    if not steps:
        steps.append({
            "line": 1,
            "event": "finished",
            "stdout": stdout.getvalue(),
            "is_loop_header": False,
            "frames": [{"name": "Global frame", "locals": {}}],
            "heap": {},
            "error": None
        })

    return {
        "steps": steps,
        "loop_headers": sorted(headers),
        "truncated": truncated
    }
`;

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function highlightPython(source) {
  const escaped = escapeHtml(source);
  const pattern = /(#.*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b(for|in|if|else|elif|while|def|return|break|continue|range|True|False|None|and|or|not)\b|\b(print)\b|(\b\d+(?:\.\d+)?\b)/gm;

  return escaped.replace(pattern, (match, comment, string, keyword, builtin, number) => {
    if (comment) return `<span class="syntax-comment">${comment}</span>`;
    if (string) return `<span class="syntax-string">${string}</span>`;
    if (keyword) return `<span class="syntax-keyword">${keyword}</span>`;
    if (builtin) return `<span class="syntax-builtin">${builtin}</span>`;
    if (number) return `<span class="syntax-number">${number}</span>`;
    return match;
  });
}

function updateSyntaxHighlight() {
  syntaxCode.innerHTML = `${highlightPython(notesText.value)}\n`;
}

function syncEditorScroll() {
  const highlight = document.querySelector("#syntaxHighlight");
  highlight.scrollTop = notesText.scrollTop;
  highlight.scrollLeft = notesText.scrollLeft;
}

function getPyodide() {
  if (!pyodidePromise) {
    if (typeof loadPyodide !== "function") {
      return Promise.reject(
        new Error("Pyodide failed to load. Serve this folder over HTTP (not file://).")
      );
    }
    pyodidePromise = loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.3/full/"
    }).then(async (pyodide) => {
      await pyodide.runPythonAsync(TRACER_BOOTSTRAP);
      return pyodide;
    });
  }
  return pyodidePromise;
}

function childLabels(object, parentLabel) {
  if (object.elements) {
    return object.elements.map((value, index) => [`${parentLabel}[${index}]`, value]);
  }
  if (object.entries) {
    return object.entries.map(([key, value]) => {
      const keyText = key?.kind === "primitive" ? key.value : "...";
      return [`${parentLabel}[${keyText}]`, value];
    });
  }
  if (object.attrs) {
    return Object.entries(object.attrs).map(([name, value]) => [`${parentLabel}.${name}`, value]);
  }
  return [];
}

function buildHeapLabels(frames, heap) {
  const names = new Map();
  (frames || []).forEach((frame) => {
    Object.entries(frame.locals || {}).forEach(([name, value]) => {
      if (value?.kind !== "ref") return;
      if (!names.has(value.id)) names.set(value.id, []);
      const bound = names.get(value.id);
      if (!bound.includes(name)) bound.push(name);
    });
  });

  const labels = new Map();
  names.forEach((bound, id) => labels.set(id, bound.join(" = ")));

  const pending = [...labels.keys()];
  while (pending.length) {
    const id = pending.shift();
    const object = heap?.[id];
    if (!object) continue;
    childLabels(object, labels.get(id)).forEach(([label, value]) => {
      if (value?.kind !== "ref" || labels.has(value.id)) return;
      labels.set(value.id, label);
      pending.push(value.id);
    });
  }

  return { labels, names };
}

function labelForRef(id, heap, labels) {
  const label = labels?.get(id);
  if (label) return label;
  const type = heap?.[id]?.type || "object";
  return `${type} #${id.slice(-4)}`;
}

function renderEncodedInline(encoded, heap, labels) {
  if (!encoded) return `<span class="heap-value">?</span>`;
  if (encoded.kind === "ref") {
    return `<span class="heap-value is-ref">→ ${escapeHtml(labelForRef(encoded.id, heap, labels))}</span>`;
  }
  return `<span class="heap-value">${escapeHtml(encoded.value)}</span>`;
}

function renderFrameValue(name, encoded, heap, labels, names) {
  if (!encoded) return "";
  if (encoded.kind !== "ref") {
    return `<span class="frame-var-value">${escapeHtml(encoded.value)}</span>`;
  }
  const type = heap?.[encoded.id]?.type || "object";
  const bound = names?.get(encoded.id) || [];
  const text = bound.includes(name) ? type : `${labelForRef(encoded.id, heap, labels)} (${type})`;
  return `<span class="frame-var-value is-ref">→ ${escapeHtml(text)}</span>`;
}

function renderTutorFrames(frames, heap, labels, names) {
  if (!frames?.length) {
    tutorFrames.innerHTML = `<p class="tutor-empty">No variables yet.</p>`;
    return;
  }
  tutorFrames.innerHTML = frames.map((frame, index) => {
    const active = index === frames.length - 1 ? " active-frame" : "";
    const vars = Object.entries(frame.locals);
    const body = vars.length
      ? vars.map(([name, value]) =>
          `<div class="frame-var"><span class="frame-var-name">${escapeHtml(name)}</span><span class="frame-var-eq">=</span>${renderFrameValue(name, value, heap, labels, names)}</div>`
        ).join("")
      : `<p class="tutor-empty">Empty</p>`;
    return `<article class="frame-card${active}"><div class="frame-title">${escapeHtml(frame.name)}</div><div class="frame-vars">${body}</div></article>`;
  }).join("");
}

function renderTutorHeap(heap, labels) {
  const objects = Object.values(heap || {});
  if (!objects.length) {
    tutorHeap.innerHTML = `<p class="tutor-empty">Primitives live in frames. Lists, dicts, and objects appear here.</p>`;
    return;
  }
  tutorHeap.innerHTML = objects.map((object) => {
    let body = "";
    if (object.entries) {
      body = object.entries.map(([key, value]) =>
        `<div class="heap-dict-row">${renderEncodedInline(key, heap, labels)}<span class="heap-dict-arrow">→</span>${renderEncodedInline(value, heap, labels)}</div>`
      ).join("");
    } else if (object.elements) {
      body = object.elements.map((value, index) =>
        `<div class="heap-row"><span class="heap-index">${index}</span>${renderEncodedInline(value, heap, labels)}</div>`
      ).join("");
    } else if (object.attrs) {
      body = Object.entries(object.attrs).map(([name, value]) =>
        `<div class="heap-dict-row"><span class="heap-dict-key">${escapeHtml(name)}</span><span class="heap-dict-arrow">=</span>${renderEncodedInline(value, heap, labels)}</div>`
      ).join("");
    }
    if (!body) body = `<p class="tutor-empty">Empty</p>`;
    const label = labelForRef(object.id, heap, labels);
    return `<article class="heap-object"><div class="heap-object-title"><span class="heap-object-name">${escapeHtml(label)}</span><span class="heap-object-type">${escapeHtml(object.type)}</span></div><div class="heap-object-body">${body}</div></article>`;
  }).join("");
}

// ---------------------------------------------------------------------------
// Tree View
// ---------------------------------------------------------------------------

const TREE_BINARY_SLOTS = ["left", "right"];
const TREE_HINT_ATTRS = ["left", "right", "children", "next"];
const TREE_VALUE_KEYS = ["val", "value", "data", "key", "item", "name"];
const TREE_X_SPACING = 58;
const TREE_Y_SPACING = 78;
const TREE_NODE_RADIUS = 20;
const TREE_PADDING = 36;

function isInstance(object) {
  return Boolean(object?.attrs);
}

function findTreeTypes(heap) {
  const types = new Set();
  Object.values(heap || {}).forEach((object) => {
    if (!isInstance(object)) return;
    Object.entries(object.attrs).forEach(([name, value]) => {
      if (TREE_HINT_ATTRS.includes(name)) types.add(object.type);
      if (value?.kind !== "ref") return;
      const target = heap[value.id];
      if (isInstance(target) && target.type === object.type) types.add(object.type);
      (target?.elements || []).forEach((item) => {
        const child = item?.kind === "ref" ? heap[item.id] : null;
        if (isInstance(child) && child.type === object.type) types.add(object.type);
      });
    });
  });
  return types;
}

function isTreeNode(id, heap, treeTypes) {
  const object = heap?.[id];
  return isInstance(object) && treeTypes.has(object.type);
}

function treeChildSlots(object, heap, treeTypes) {
  const slots = [];
  Object.entries(object.attrs).forEach(([name, value]) => {
    const isRef = value?.kind === "ref";
    if (TREE_BINARY_SLOTS.includes(name)) {
      slots.push({ name, id: isRef && isTreeNode(value.id, heap, treeTypes) ? value.id : null });
      return;
    }
    if (!isRef) return;
    if (isTreeNode(value.id, heap, treeTypes)) {
      slots.push({ name, id: value.id });
      return;
    }
    (heap[value.id]?.elements || []).forEach((item, index) => {
      if (item?.kind === "ref" && isTreeNode(item.id, heap, treeTypes)) {
        slots.push({ name: `${name}[${index}]`, id: item.id });
      }
    });
  });
  return slots;
}

function treeNodeValue(object) {
  const attrs = Object.entries(object.attrs);
  const preferred = TREE_VALUE_KEYS.map((key) => object.attrs[key]).find((value) => value?.kind === "primitive");
  const fallback = attrs.map(([, value]) => value).find((value) => value?.kind === "primitive");
  const encoded = preferred || fallback;
  if (!encoded) return object.type;
  let text = encoded.value;
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1);
  return text.length > 6 ? `${text.slice(0, 5)}…` : text;
}

function collectTreePointers(frames, heap, treeTypes, labels) {
  const pointers = new Map();
  const add = (id, name, kind) => {
    if (!pointers.has(id)) pointers.set(id, []);
    const list = pointers.get(id);
    if (!list.some((pointer) => pointer.name === name)) list.push({ name, kind });
  };

  (frames || []).forEach((frame, index) => {
    const kind = index === frames.length - 1 ? "active" : "outer";
    Object.entries(frame.locals || {}).forEach(([name, value]) => {
      if (value?.kind === "ref" && isTreeNode(value.id, heap, treeTypes)) add(value.id, name, kind);
    });
  });

  Object.values(heap || {}).forEach((object) => {
    if (!isInstance(object) || treeTypes.has(object.type)) return;
    Object.entries(object.attrs).forEach(([name, value]) => {
      if (value?.kind === "ref" && isTreeNode(value.id, heap, treeTypes)) {
        add(value.id, `${labelForRef(object.id, heap, labels)}.${name}`, "attr");
      }
    });
  });

  return pointers;
}

function layoutTreeForest(heap, treeTypes) {
  const nodeIds = Object.keys(heap || {}).filter((id) => isTreeNode(id, heap, treeTypes));
  const childIds = new Set();
  nodeIds.forEach((id) => {
    treeChildSlots(heap[id], heap, treeTypes).forEach((slot) => slot.id && childIds.add(slot.id));
  });

  const roots = nodeIds.filter((id) => !childIds.has(id));
  const positions = new Map();
  const edges = [];
  const visited = new Set();
  let nextX = 0;
  let maxDepth = 0;

  function place(id, depth) {
    visited.add(id);
    maxDepth = Math.max(maxDepth, depth);
    const slots = treeChildSlots(heap[id], heap, treeTypes);
    const hasRealChild = slots.some((slot) => slot.id && !visited.has(slot.id));

    if (!hasRealChild) {
      slots.forEach((slot) => slot.id && edges.push({ from: id, to: slot.id, shared: true }));
      const x = nextX++;
      positions.set(id, { x, depth });
      return x;
    }

    const xs = [];
    slots.forEach((slot) => {
      if (slot.id === null) {
        xs.push(nextX++);
      } else if (visited.has(slot.id)) {
        edges.push({ from: id, to: slot.id, shared: true });
      } else {
        edges.push({ from: id, to: slot.id, shared: false });
        xs.push(place(slot.id, depth + 1));
      }
    });

    const x = (xs[0] + xs[xs.length - 1]) / 2;
    positions.set(id, { x, depth });
    return x;
  }

  roots.forEach((id) => {
    if (!visited.has(id)) {
      place(id, 0);
      nextX += 0.6;
    }
  });
  nodeIds.forEach((id) => {
    if (!visited.has(id)) {
      place(id, 0);
      nextX += 0.6;
    }
  });

  return { positions, edges, width: Math.max(nextX - 0.6, 1), maxDepth, count: nodeIds.length };
}

const QUEUE_NAME_PATTERN = /^(q|queue|que|dq|deque|frontier|to_visit|bfs|stack|stk|dfs)$/i;

function queueItemNodeId(encoded, heap, treeTypes) {
  if (encoded?.kind !== "ref") return null;
  if (isTreeNode(encoded.id, heap, treeTypes)) return encoded.id;
  const wrapper = heap[encoded.id];
  if (wrapper?.type !== "tuple" && wrapper?.type !== "list") return null;
  const inner = (wrapper.elements || []).find((item) => item?.kind === "ref" && isTreeNode(item.id, heap, treeTypes));
  return inner ? inner.id : null;
}

function queueItemLabel(encoded, heap, treeTypes, labels) {
  if (!encoded) return "?";
  if (encoded.kind !== "ref") return encoded.value;
  if (isTreeNode(encoded.id, heap, treeTypes)) return treeNodeValue(heap[encoded.id]);
  const wrapper = heap[encoded.id];
  if (wrapper?.elements && queueItemNodeId(encoded, heap, treeTypes)) {
    return wrapper.elements.map((item) => queueItemLabel(item, heap, treeTypes, labels)).join(", ");
  }
  return labelForRef(encoded.id, heap, labels);
}

function findTreeQueues(frames, heap, treeTypes) {
  const queues = [];
  const seen = new Set();
  const nodeOwned = new Set();
  const nodeAttrNames = new Set(TREE_HINT_ATTRS);
  Object.values(heap || {}).forEach((object) => {
    if (!isInstance(object) || !treeTypes.has(object.type)) return;
    Object.entries(object.attrs).forEach(([attrName, value]) => {
      nodeAttrNames.add(attrName);
      if (value?.kind === "ref") nodeOwned.add(value.id);
    });
  });

  [...(frames || [])].reverse().forEach((frame, reverseIndex) => {
    Object.entries(frame.locals || {}).forEach(([name, value]) => {
      if (value?.kind !== "ref" || seen.has(value.id)) return;
      const container = heap[value.id];
      if (!container?.elements || container.type === "set" || container.type === "frozenset") return;
      const namedLikeQueue = QUEUE_NAME_PATTERN.test(name);
      if ((nodeOwned.has(value.id) || nodeAttrNames.has(name)) && !namedLikeQueue) return;
      const holdsNodes = container.elements.some((item) => queueItemNodeId(item, heap, treeTypes));
      if (!holdsNodes && container.type !== "deque" && !namedLikeQueue) return;
      seen.add(value.id);
      queues.push({ name, frameName: frame.name, active: reverseIndex === 0, container });
    });
  });
  return queues;
}

const TRAVERSAL_MODES = {
  queue: {
    nextIndex: (last) => 0,
    nextTag: "front",
    endTag: "back",
    leftArrow: "← out",
    rightArrow: "← in",
    legend: "In queue"
  },
  stack: {
    nextIndex: (last) => last,
    nextTag: "top",
    endTag: "bottom",
    leftArrow: "bottom",
    rightArrow: "⇄ push / pop",
    legend: "On stack"
  }
};

function traversalModeFor(tab) {
  return TRAVERSAL_MODES[tab?.traversalMode] ? tab.traversalMode : "queue";
}

function renderTraversalToolbar(mode) {
  return `
    <div class="traversal-toolbar">
      <span class="traversal-label">Show as</span>
      <div class="tutor-view-toggle traversal-toggle" role="tablist" aria-label="Traversal structure">
        ${["queue", "stack"].map((option) => `
          <button class="view-toggle-button${option === mode ? " active" : ""}" type="button" role="tab" aria-selected="${option === mode}" data-traversal-mode="${option}">
            ${option === "queue" ? "Queue" : "Stack"}
          </button>`).join("")}
      </div>
    </div>`;
}

function renderTreeQueues(queues, heap, treeTypes, labels, activeNodeIds, mode) {
  const config = TRAVERSAL_MODES[mode];
  tutorTreeQueues.hidden = false;

  const rows = queues.map((queue) => {
    const items = queue.container.elements;
    const last = items.length - 1;
    const nextIndex = config.nextIndex(last);
    const endIndex = mode === "queue" ? last : 0;
    const cells = items.length
      ? items.map((item, index) => {
          const nodeId = queueItemNodeId(item, heap, treeTypes);
          const classes = ["queue-cell"];
          if (index === nextIndex) classes.push("next");
          if (index === endIndex) classes.push("end");
          if (nodeId && activeNodeIds.has(nodeId)) classes.push("active");
          const tag = index === nextIndex && index === endIndex
            ? `${config.nextTag} · ${config.endTag}`
            : index === nextIndex
              ? config.nextTag
              : index === endIndex
                ? config.endTag
                : "";
          return `
            <div class="${classes.join(" ")}">
              <span class="queue-tag">${tag}</span>
              <span class="queue-value">${escapeHtml(queueItemLabel(item, heap, treeTypes, labels))}</span>
              <span class="queue-index">${index}</span>
            </div>`;
        }).join("")
      : `<div class="queue-empty">empty</div>`;

    return `
      <div class="queue-row${queue.active ? "" : " outer"}">
        <div class="queue-header">
          <span class="queue-name">${escapeHtml(queue.name)}</span>
          <span class="queue-meta">${escapeHtml(queue.container.type)} · ${items.length} item${items.length === 1 ? "" : "s"}${queue.active ? "" : ` · ${escapeHtml(queue.frameName)}`}</span>
        </div>
        <div class="queue-track">
          <span class="queue-direction">${config.leftArrow}</span>
          <div class="queue-cells">${cells}</div>
          <span class="queue-direction">${config.rightArrow}</span>
        </div>
      </div>`;
  }).join("");

  tutorTreeQueues.innerHTML = renderTraversalToolbar(mode) + (rows || `<p class="tutor-empty">No queue or stack variables at this step.</p>`);
}

function renderTreeLegend(frames, heap, treeTypes, mode) {
  const activeFrame = frames?.[frames.length - 1];
  const chips = Object.entries(activeFrame?.locals || {}).flatMap(([name, value]) => {
    if (value?.kind === "ref" && isTreeNode(value.id, heap, treeTypes)) {
      return [`<span class="tree-chip active"><strong>${escapeHtml(name)}</strong> → ${escapeHtml(treeNodeValue(heap[value.id]))}</span>`];
    }
    if (value?.kind === "primitive" && value.type === "NoneType") {
      return [`<span class="tree-chip none"><strong>${escapeHtml(name)}</strong> → None</span>`];
    }
    return [];
  });

  const frameName = activeFrame ? escapeHtml(activeFrame.name) : "—";
  tutorTreeLegend.innerHTML = `
    <div class="tree-legend-row">
      <span class="tree-key"><span class="tree-swatch active"></span>Variable in ${frameName}</span>
      <span class="tree-key"><span class="tree-swatch outer"></span>Variable in an outer frame</span>
      <span class="tree-key"><span class="tree-swatch attr"></span>Object attribute</span>
      <span class="tree-key"><span class="tree-swatch queued"></span>${TRAVERSAL_MODES[mode].legend}</span>
    </div>
    ${chips.length ? `<div class="tree-legend-row">${chips.join("")}</div>` : ""}
  `;
}

function renderTutorTree(frames, heap, labels) {
  const treeTypes = findTreeTypes(heap);
  const mode = traversalModeFor(getActiveTab());
  renderTreeLegend(frames, heap, treeTypes, mode);

  const layout = layoutTreeForest(heap, treeTypes);
  if (!layout.count) {
    renderTreeQueues([], heap, treeTypes, labels, new Set(), mode);
    tutorTreeCanvas.innerHTML = `<p class="tutor-empty">No tree nodes in memory at this step. Tree nodes are class instances with <code>left</code>/<code>right</code>, <code>children</code>, or attributes that point to other instances of the same class.</p>`;
    return;
  }

  const pointers = collectTreePointers(frames, heap, treeTypes, labels);
  const activeNodeIds = new Set(
    [...pointers.entries()].filter(([, list]) => list.some((p) => p.kind === "active")).map(([id]) => id)
  );
  const queues = findTreeQueues(frames, heap, treeTypes);
  renderTreeQueues(queues, heap, treeTypes, labels, activeNodeIds, mode);

  const queuedIds = new Set();
  const nextIds = new Set();
  queues.forEach((queue) => {
    const items = queue.container.elements;
    const nextIndex = TRAVERSAL_MODES[mode].nextIndex(items.length - 1);
    items.forEach((item, index) => {
      const nodeId = queueItemNodeId(item, heap, treeTypes);
      if (!nodeId) return;
      queuedIds.add(nodeId);
      if (index === nextIndex) nextIds.add(nodeId);
    });
  });

  const toPixel = ({ x, depth }) => ({
    cx: TREE_PADDING + x * TREE_X_SPACING,
    cy: TREE_PADDING + depth * TREE_Y_SPACING
  });
  const width = TREE_PADDING * 2 + layout.width * TREE_X_SPACING;
  const height = TREE_PADDING * 2 + layout.maxDepth * TREE_Y_SPACING + 28;

  const edgeSvg = layout.edges.map((edge) => {
    const from = toPixel(layout.positions.get(edge.from));
    const to = toPixel(layout.positions.get(edge.to));
    return `<line class="tree-edge${edge.shared ? " shared" : ""}" x1="${from.cx}" y1="${from.cy}" x2="${to.cx}" y2="${to.cy}" />`;
  }).join("");

  const nodeSvg = [...layout.positions.entries()].map(([id, position]) => {
    const { cx, cy } = toPixel(position);
    const nodePointers = pointers.get(id) || [];
    const state = nodePointers.some((p) => p.kind === "active")
      ? "active"
      : nodePointers.some((p) => p.kind === "outer")
        ? "outer"
        : nodePointers.length
          ? "attr"
          : "";

    let pointerSvg = "";
    if (nodePointers.length) {
      const text = nodePointers.map((p) => p.name).join(", ");
      const shown = text.length > 22 ? `${text.slice(0, 21)}…` : text;
      const pillWidth = shown.length * 6.6 + 12;
      const pillY = cy + TREE_NODE_RADIUS + 6;
      pointerSvg = `
        <g class="tree-pointer ${state}">
          <title>${escapeHtml(text)}</title>
          <rect x="${cx - pillWidth / 2}" y="${pillY}" width="${pillWidth}" height="17" rx="8.5" />
          <text x="${cx}" y="${pillY + 12.5}">${escapeHtml(shown)}</text>
        </g>`;
    }

    const queueRing = queuedIds.has(id)
      ? `<circle class="tree-queue-ring${nextIds.has(id) ? " next" : ""}" cx="${cx}" cy="${cy}" r="${TREE_NODE_RADIUS + 5}" />`
      : "";

    return `
      ${queueRing}
      <g class="tree-node ${state}">
        <title>${escapeHtml(labelForRef(id, heap, labels))} (${escapeHtml(heap[id].type)})</title>
        <circle cx="${cx}" cy="${cy}" r="${TREE_NODE_RADIUS}" />
        <text x="${cx}" y="${cy + 4.5}">${escapeHtml(treeNodeValue(heap[id]))}</text>
      </g>
      ${pointerSvg}`;
  }).join("");

  tutorTreeCanvas.innerHTML = `
    <svg class="tree-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Tree diagram">
      ${edgeSvg}
      ${nodeSvg}
    </svg>`;

  const focus = tutorTreeCanvas.querySelector(".tree-node.active circle");
  if (focus) focus.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function applyTutorView(tab) {
  const showTree = tab?.tutorView === "tree";
  tutorTreeView.hidden = !showTree;
  tutorMemoryLayout.hidden = showTree;
  tutorMemoryViewButton.classList.toggle("active", !showTree);
  tutorTreeViewButton.classList.toggle("active", showTree);
  tutorMemoryViewButton.setAttribute("aria-selected", String(!showTree));
  tutorTreeViewButton.setAttribute("aria-selected", String(showTree));
}

function setTutorView(view) {
  const tab = getActiveTab();
  if (!tab) return;
  tab.tutorView = view;
  applyTutorView(tab);
  if (tab.tutorActive) showTutorStep(tab.tutorStepIndex);
}

function renderTraceCode(code, activeLine) {
  const lines = (code || "").split("\n");
  traceCode.innerHTML = lines.map((line, index) => {
    const lineNumber = index + 1;
    const active = lineNumber === activeLine ? " active" : "";
    const content = line.length ? highlightPython(line) : " ";
    return `<li class="${active.trim()}" data-line="${lineNumber}">${content}</li>`;
  }).join("");
  const activeItem = traceCode.querySelector("li.active");
  if (activeItem) {
    activeItem.scrollIntoView({ block: "nearest" });
  }
}

// ---------------------------------------------------------------------------
// Tabs & Multi-File State
// ---------------------------------------------------------------------------

function getActiveTab() {
  return tabs.find((t) => t.id === activeTabId) || null;
}

function createTab(initialCode = null) {
  tabCounter++;
  const num = tabCounter;
  const newTab = {
    id: `tab-${num}`,
    number: num,
    title: `Tab ${num}`,
    code: initialCode !== null ? initialCode : "",
    consoleOutput: "Run or Visualize to see output...",
    tutorActive: false,
    tutorSteps: [],
    tutorStepIndex: 0,
    tutorStatus: "",
    tutorView: "memory",
    traversalMode: "queue"
  };
  tabs.push(newTab);
  switchTab(newTab.id);
  return newTab;
}

function switchTab(targetTabId) {
  const currentTab = getActiveTab();
  if (currentTab && currentTab.id !== targetTabId) {
    if (!currentTab.tutorActive) {
      currentTab.code = notesText.value;
      currentTab.consoleOutput = scratchConsole.textContent;
    }
  }

  activeTabId = targetTabId;
  const tab = getActiveTab();
  if (!tab) return;

  renderTabsUI();
  syncTabToUI(tab);
}

function closeTab(targetTabId) {
  if (tabs.length <= 1) return;
  const index = tabs.findIndex((t) => t.id === targetTabId);
  if (index === -1) return;

  let nextActiveId = activeTabId;
  if (targetTabId === activeTabId) {
    const nextTab = index > 0 ? tabs[index - 1] : tabs[index + 1];
    nextActiveId = nextTab.id;
  }

  tabs = tabs.filter((t) => t.id !== targetTabId);

  if (targetTabId === activeTabId) {
    switchTab(nextActiveId);
  } else {
    renderTabsUI();
  }
}

function renderTabsUI() {
  const showClose = tabs.length > 1;
  editorTabsContainer.innerHTML = tabs.map((tab) => {
    const isActive = tab.id === activeTabId;
    return `
      <button
        class="editor-tab${isActive ? " active" : ""}"
        type="button"
        role="tab"
        aria-selected="${isActive}"
        data-tab-id="${tab.id}"
        title="file ${tab.number}"
      >
        <span class="tab-title">${escapeHtml(tab.title)}</span>
        ${
          showClose
            ? `<span class="tab-close" data-close-tab-id="${tab.id}" title="Close ${escapeHtml(tab.title)}" aria-label="Close ${escapeHtml(tab.title)}">×</span>`
            : ""
        }
      </button>
    `;
  }).join("");
}

function syncTabToUI(tab) {
  consoleHeading.textContent = `Console — ${tab.title}`;

  if (tab.tutorActive) {
    scratchEditor.classList.add("tracing");
    traceCode.hidden = false;
    tutorPanel.hidden = false;
    idlePanel.hidden = true;
    exitTutorButton.hidden = false;
    runButton.hidden = true;
    visualizeButton.hidden = true;
    applyTutorView(tab);
    showTutorStep(tab.tutorStepIndex);
  } else {
    scratchEditor.classList.remove("tracing");
    traceCode.hidden = true;
    tutorPanel.hidden = true;
    idlePanel.hidden = false;
    exitTutorButton.hidden = true;
    runButton.hidden = false;
    visualizeButton.hidden = false;
    notesText.value = tab.code;
    updateSyntaxHighlight();
    scratchConsole.textContent = tab.consoleOutput || "Run or Visualize to see output...";
  }
}

function exitTutorMode(clearConsole = true) {
  const tab = getActiveTab();
  if (!tab) return;
  tab.tutorActive = false;
  tab.tutorSteps = [];
  tab.tutorStepIndex = 0;
  tab.tutorStatus = "";
  if (clearConsole) {
    tab.consoleOutput = "Run or Visualize to see output...";
  }
  syncTabToUI(tab);
}

// ---------------------------------------------------------------------------
// Stepper Controls
// ---------------------------------------------------------------------------

function findNextLoopIterationIndex(tab) {
  if (!tab || !tab.tutorSteps?.length) return -1;
  const current = tab.tutorSteps[tab.tutorStepIndex];
  let targetHeader = null;
  if (current?.is_loop_header) {
    targetHeader = current.line;
  } else {
    for (let index = tab.tutorStepIndex; index >= 0; index--) {
      if (tab.tutorSteps[index].is_loop_header) {
        targetHeader = tab.tutorSteps[index].line;
        break;
      }
    }
  }

  if (targetHeader != null) {
    for (let index = tab.tutorStepIndex + 1; index < tab.tutorSteps.length; index++) {
      if (tab.tutorSteps[index].is_loop_header && tab.tutorSteps[index].line === targetHeader) {
        return index;
      }
    }
  }

  for (let index = tab.tutorStepIndex + 1; index < tab.tutorSteps.length; index++) {
    if (tab.tutorSteps[index].is_loop_header) return index;
  }
  return -1;
}

function updateTutorControls(tab) {
  if (!tab || !tab.tutorSteps.length) return;
  const lastIndex = Math.max(tab.tutorSteps.length - 1, 0);
  tutorPrev.disabled = tab.tutorStepIndex <= 0;
  tutorNext.disabled = tab.tutorStepIndex >= lastIndex;
  tutorSlider.max = String(lastIndex);
  tutorSlider.value = String(tab.tutorStepIndex);

  const nextIter = findNextLoopIterationIndex(tab);
  tutorNextIter.disabled = nextIter < 0;
  tutorNextIter.dataset.target = String(nextIter);
}

function showTutorStep(index) {
  const tab = getActiveTab();
  if (!tab || !tab.tutorSteps.length) return;

  tab.tutorStepIndex = Math.max(0, Math.min(index, tab.tutorSteps.length - 1));
  const step = tab.tutorSteps[tab.tutorStepIndex];
  const isFinished = step.event === "finished";
  const isError = step.event === "exception";

  tutorStepCount.textContent = `Step ${tab.tutorStepIndex + 1} of ${tab.tutorSteps.length}`;
  tutorLineLabel.textContent = isFinished
    ? "Program finished"
    : `About to run line ${step.line}`;

  renderTraceCode(tab.code, isFinished ? null : step.line);
  const { labels, names } = buildHeapLabels(step.frames, step.heap);
  if (tab.tutorView === "tree") {
    renderTutorTree(step.frames, step.heap, labels);
  } else {
    renderTutorFrames(step.frames, step.heap, labels, names);
    renderTutorHeap(step.heap, labels);
  }

  const stepOutput = step.stdout?.trim()
    ? step.stdout.replace(/\n$/, "")
    : isFinished && !step.error
      ? "Program finished with no output."
      : "";
  scratchConsole.textContent = stepOutput;
  tab.consoleOutput = stepOutput;

  if (isError && step.error) {
    tutorStatus.textContent = step.error;
    const combined = step.stdout?.trim() ? `${step.stdout.replace(/\n$/, "")}\n${step.error}` : step.error;
    scratchConsole.textContent = combined;
    tab.consoleOutput = combined;
  } else if (isFinished) {
    tutorStatus.textContent = "Done. Use Previous to review earlier steps.";
  } else if (step.is_loop_header) {
    tutorStatus.textContent = "Loop header — Next loop iteration jumps to the next time this loop runs.";
  } else {
    tutorStatus.textContent = "Highlighted line is about to execute.";
  }

  updateTutorControls(tab);
}

// ---------------------------------------------------------------------------
// Run & Visualize Execution
// ---------------------------------------------------------------------------

async function runScratchCode() {
  const tab = getActiveTab();
  if (!tab) return;
  tab.code = notesText.value;

  runButton.disabled = true;
  visualizeButton.disabled = true;
  scratchConsole.textContent = "Loading Python runtime (first run may take a few seconds)...";

  try {
    exitTutorMode(false);
    const pyodide = await getPyodide();
    const chunks = [];
    pyodide.setStdout({ batched: (text) => chunks.push(text) });
    pyodide.setStderr({ batched: (text) => chunks.push(text) });
    await pyodide.runPythonAsync(tab.code);
    const result = chunks.length ? chunks.join("\n") : "Program finished with no output.";
    scratchConsole.textContent = result;
    tab.consoleOutput = result;
  } catch (error) {
    const errorMsg = `Error: ${error.message}`;
    scratchConsole.textContent = errorMsg;
    tab.consoleOutput = errorMsg;
  } finally {
    runButton.disabled = false;
    visualizeButton.disabled = false;
  }
}

async function visualizeScratchCode() {
  const tab = getActiveTab();
  if (!tab) return;
  tab.code = notesText.value;

  visualizeButton.disabled = true;
  runButton.disabled = true;
  scratchConsole.textContent = "Loading Python runtime and building execution trace...";

  try {
    const pyodide = await getPyodide();
    pyodide.globals.set("USER_SOURCE", tab.code);
    const raw = await pyodide.runPythonAsync("import json; json.dumps(tutor_trace(USER_SOURCE))");
    const data = JSON.parse(raw);
    tab.tutorSteps = data.steps || [];
    if (!tab.tutorSteps.length) {
      throw new Error("No execution steps were produced.");
    }
    tab.tutorActive = true;
    tab.tutorStepIndex = 0;
    syncTabToUI(tab);
    if (data.truncated) {
      tutorStatus.textContent = `Stopped after ${tab.tutorSteps.length} steps to keep the browser responsive.`;
    }
  } catch (error) {
    exitTutorMode(false);
    const errorMsg = `Error: ${error.message}`;
    scratchConsole.textContent = errorMsg;
    tab.consoleOutput = errorMsg;
  } finally {
    visualizeButton.disabled = false;
    runButton.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------------------------

editorTabsContainer.addEventListener("click", (event) => {
  const closeBtn = event.target.closest("[data-close-tab-id]");
  if (closeBtn) {
    event.stopPropagation();
    closeTab(closeBtn.dataset.closeTabId);
    return;
  }
  const tabBtn = event.target.closest("[data-tab-id]");
  if (tabBtn) {
    switchTab(tabBtn.dataset.tabId);
  }
});

addTabButton.addEventListener("click", () => {
  createTab("");
  notesText.focus();
});

resetButton.addEventListener("click", () => {
  const tab = getActiveTab();
  if (!tab) return;
  if (tab.tutorActive) {
    exitTutorMode(false);
  }
  tab.code = tab.number === 1 ? INITIAL_CODE_TAB_1 : "";
  tab.consoleOutput = "Run or Visualize to see output...";
  notesText.value = tab.code;
  updateSyntaxHighlight();
  scratchConsole.textContent = tab.consoleOutput;
  notesText.focus();
});

notesText.addEventListener("input", () => {
  const tab = getActiveTab();
  if (tab) {
    tab.code = notesText.value;
  }
  updateSyntaxHighlight();
});

notesText.addEventListener("scroll", syncEditorScroll);

notesText.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  event.preventDefault();

  const start = notesText.selectionStart;
  const end = notesText.selectionEnd;
  const indentation = "    ";
  notesText.setRangeText(indentation, start, end, "end");
  const tab = getActiveTab();
  if (tab) {
    tab.code = notesText.value;
  }
  updateSyntaxHighlight();
});

runButton.addEventListener("click", runScratchCode);
visualizeButton.addEventListener("click", visualizeScratchCode);
exitTutorButton.addEventListener("click", () => exitTutorMode(true));

tutorPrev.addEventListener("click", () => {
  const tab = getActiveTab();
  if (tab) showTutorStep(tab.tutorStepIndex - 1);
});

tutorNext.addEventListener("click", () => {
  const tab = getActiveTab();
  if (tab) showTutorStep(tab.tutorStepIndex + 1);
});

tutorFirst.addEventListener("click", () => {
  showTutorStep(0);
});

tutorLast.addEventListener("click", () => {
  const tab = getActiveTab();
  if (tab) showTutorStep(tab.tutorSteps.length - 1);
});

tutorNextIter.addEventListener("click", () => {
  const target = Number(tutorNextIter.dataset.target);
  if (target >= 0) showTutorStep(target);
});

tutorSlider.addEventListener("input", () => {
  showTutorStep(Number(tutorSlider.value));
});

tutorMemoryViewButton.addEventListener("click", () => setTutorView("memory"));
tutorTreeViewButton.addEventListener("click", () => setTutorView("tree"));

tutorTreeQueues.addEventListener("click", (event) => {
  const button = event.target.closest("[data-traversal-mode]");
  const tab = getActiveTab();
  if (!button || !tab) return;
  tab.traversalMode = button.dataset.traversalMode;
  if (tab.tutorActive) showTutorStep(tab.tutorStepIndex);
});

clearScratchConsole.addEventListener("click", () => {
  const tab = getActiveTab();
  if (tab) {
    tab.consoleOutput = "";
  }
  scratchConsole.textContent = "";
});

// ---------------------------------------------------------------------------
// Initialize App
// ---------------------------------------------------------------------------

createTab(INITIAL_CODE_TAB_1);
