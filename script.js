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
const tutorMethodJump = document.querySelector("#tutorMethodJump");
const tutorMethodSelect = document.querySelector("#tutorMethodSelect");
const tutorSkipMethod = document.querySelector("#tutorSkipMethodButton");
const tutorFrames = document.querySelector("#tutorFrames");
const tutorHeap = document.querySelector("#tutorHeap");
const tutorMemoryLayout = document.querySelector("#tutorMemoryLayout");
const tutorTreeView = document.querySelector("#tutorTreeView");
const tutorTreeLegend = document.querySelector("#tutorTreeLegend");
const tutorTreeCanvas = document.querySelector("#tutorTreeCanvas");
const tutorTreeQueues = document.querySelector("#tutorTreeQueues");
const tutorMemoryViewButton = document.querySelector("#tutorMemoryViewButton");
const tutorTreeViewButton = document.querySelector("#tutorTreeViewButton");
const tutorGraphView = document.querySelector("#tutorGraphView");
const tutorGraphLegend = document.querySelector("#tutorGraphLegend");
const tutorGraphCanvas = document.querySelector("#tutorGraphCanvas");
const tutorGraphAdjacency = document.querySelector("#tutorGraphAdjacency");
const tutorGraphSearch = document.querySelector("#tutorGraphSearch");
const tutorGraphViewButton = document.querySelector("#tutorGraphViewButton");
const graphZoomOutButton = document.querySelector("#graphZoomOutButton");
const graphZoomInButton = document.querySelector("#graphZoomInButton");
const graphZoomInput = document.querySelector("#graphZoomInput");
const graphZoomBar = document.querySelector("#graphZoomBar");
const tutorPathView = document.querySelector("#tutorPathView");
const tutorPathLegend = document.querySelector("#tutorPathLegend");
const tutorPathCanvas = document.querySelector("#tutorPathCanvas");
const tutorPathState = document.querySelector("#tutorPathState");
const tutorPathViewButton = document.querySelector("#tutorPathViewButton");
const pathZoomOutButton = document.querySelector("#pathZoomOutButton");
const pathZoomInButton = document.querySelector("#pathZoomInButton");
const pathZoomInput = document.querySelector("#pathZoomInput");
const pathZoomBar = document.querySelector("#pathZoomBar");
const tutorDsuView = document.querySelector("#tutorDsuView");
const tutorDsuLegend = document.querySelector("#tutorDsuLegend");
const tutorDsuCanvas = document.querySelector("#tutorDsuCanvas");
const tutorDsuParents = document.querySelector("#tutorDsuParents");
const tutorDsuByRank = document.querySelector("#tutorDsuByRank");
const tutorDsuBySize = document.querySelector("#tutorDsuBySize");
const tutorDsuDetail = document.querySelector("#tutorDsuDetail");
const tutorDsuViewButton = document.querySelector("#tutorDsuViewButton");
const tutorDpView = document.querySelector("#tutorDpView");
const tutorDpLegend = document.querySelector("#tutorDpLegend");
const tutorDpTables = document.querySelector("#tutorDpTables");
const tutorDpChoice = document.querySelector("#tutorDpChoice");
const tutorDpRebuild = document.querySelector("#tutorDpRebuild");
const tutorDpViewButton = document.querySelector("#tutorDpViewButton");
const tutorVarFocus = document.querySelector("#tutorVarFocus");
const tutorVarFocusKicker = document.querySelector("#tutorVarFocusKicker");
const tutorVarFocusTitle = document.querySelector("#tutorVarFocusTitle");
const tutorVarFocusBody = document.querySelector("#tutorVarFocusBody");
const tutorVarFocusClose = document.querySelector("#tutorVarFocusClose");

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

def _defined_functions(source):
    names = []
    seen = set()
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return names
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name not in seen:
            seen.add(node.name)
            names.append(node.name)
    return names

def tutor_trace(source):
    steps = []
    headers = _loop_headers(source)
    methods = _defined_functions(source)
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
                "function": None,
                "frames": [{"name": "Global frame", "locals": {}}],
                "heap": {},
                "error": f"SyntaxError: {exc.msg}"
            }],
            "loop_headers": sorted(headers),
            "methods": methods,
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
        fn_name = frame.f_code.co_name
        steps.append({
            "line": frame.f_lineno,
            "event": "line",
            "stdout": stdout.getvalue(),
            "is_loop_header": frame.f_lineno in headers,
            "function": None if fn_name == "<module>" else fn_name,
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
                "function": steps[-1].get("function") if steps else None,
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
            "function": None,
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
            "function": None,
            "frames": [{"name": "Global frame", "locals": {}}],
            "heap": {},
            "error": None
        })

    return {
        "steps": steps,
        "loop_headers": sorted(headers),
        "methods": methods,
        "truncated": truncated
    }
`;

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(text) {
  return escapeHtml(text).replaceAll('"', "&quot;");
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
      ? vars.map(([name]) =>
          `<button class="frame-var" type="button" data-focus-frame="${index}" data-focus-name="${escapeAttr(name)}" title="Show only ${escapeAttr(name)}"><span class="frame-var-name">${escapeHtml(name)}</span><span class="frame-var-eq">=</span>${renderFrameValue(name, frame.locals[name], heap, labels, names)}</button>`
        ).join("")
      : `<p class="tutor-empty">Empty</p>`;
    return `<article class="frame-card${active}"><div class="frame-title">${escapeHtml(frame.name)}</div><div class="frame-vars">${body}</div></article>`;
  }).join("");
}

function focusSlotButton(label, part, parentId, index, inner) {
  return `<button class="heap-slot" type="button" data-focus-parent="${escapeAttr(parentId)}" data-focus-part="${escapeAttr(part)}" data-focus-index="${escapeAttr(index)}" data-focus-label="${escapeAttr(label)}" title="Show only ${escapeAttr(label)}">${inner}</button>`;
}

function renderTutorHeap(heap, labels) {
  const objects = Object.values(heap || {});
  if (!objects.length) {
    tutorHeap.innerHTML = `<p class="tutor-empty">Primitives live in frames. Lists, dicts, and objects appear here.</p>`;
    return;
  }
  tutorHeap.innerHTML = objects.map((object) => {
    const label = labelForRef(object.id, heap, labels);
    let body = "";
    if (object.entries) {
      body = object.entries.map(([key, value], index) => {
        const keyText = key?.kind === "primitive" ? stripQuotes(key.value) : `key ${index}`;
        const keyLabel = `${label} key ${keyText}`;
        const valueLabel = `${label}[${keyText}]`;
        return `<div class="heap-dict-row">${focusSlotButton(keyLabel, "entry-key", object.id, index, renderEncodedInline(key, heap, labels))}<span class="heap-dict-arrow">→</span>${focusSlotButton(valueLabel, "entry", object.id, index, renderEncodedInline(value, heap, labels))}</div>`;
      }).join("");
    } else if (object.elements) {
      body = object.elements.map((value, index) => {
        const slotLabel = `${label}[${index}]`;
        return focusSlotButton(slotLabel, "element", object.id, index, `<span class="heap-index">${index}</span>${renderEncodedInline(value, heap, labels)}`).replace("heap-slot", "heap-row heap-slot");
      }).join("");
    } else if (object.attrs) {
      body = Object.entries(object.attrs).map(([name, value]) => {
        const slotLabel = `${label}.${name}`;
        return `<div class="heap-dict-row"><span class="heap-dict-key">${escapeHtml(name)}</span><span class="heap-dict-arrow">=</span>${focusSlotButton(slotLabel, "attr", object.id, name, renderEncodedInline(value, heap, labels))}</div>`;
      }).join("");
    }
    if (!body) body = `<p class="tutor-empty">Empty</p>`;
    return `<article class="heap-object"><button class="heap-object-title" type="button" data-focus-id="${escapeAttr(object.id)}" data-focus-label="${escapeAttr(label)}" title="Show only ${escapeAttr(label)}"><span class="heap-object-name">${escapeHtml(label)}</span><span class="heap-object-type">${escapeHtml(object.type)}</span></button><div class="heap-object-body">${body}</div></article>`;
  }).join("");
}

function renderFocusValue(encoded, heap, labels, stack, depth) {
  if (!encoded) return `<span class="heap-value">?</span>`;
  if (encoded.kind !== "ref") {
    return `<span class="focus-primitive"><span class="focus-type">${escapeHtml(encoded.type)}</span>${escapeHtml(encoded.value)}</span>`;
  }
  if (stack.has(encoded.id)) {
    return `<span class="heap-value is-ref">↻ ${escapeHtml(labelForRef(encoded.id, heap, labels))}</span>`;
  }
  const object = heap?.[encoded.id];
  if (!object) return `<span class="heap-value">missing</span>`;
  if (depth >= 10) {
    return `<span class="heap-value is-ref">→ ${escapeHtml(labelForRef(encoded.id, heap, labels))} (${escapeHtml(object.type)})</span>`;
  }

  stack.add(encoded.id);
  let inner = "";
  if (object.elements) {
    inner = object.elements.length
      ? object.elements.map((value, index) =>
          `<div class="focus-row"><span class="heap-index">${index}</span><div>${renderFocusValue(value, heap, labels, stack, depth + 1)}</div></div>`
        ).join("")
      : `<p class="tutor-empty">Empty ${escapeHtml(object.type)}</p>`;
  } else if (object.entries) {
    inner = object.entries.length
      ? object.entries.map(([key, value]) =>
          `<div class="focus-entry"><div>${renderFocusValue(key, heap, labels, stack, depth + 1)}</div><span class="heap-dict-arrow">→</span><div>${renderFocusValue(value, heap, labels, stack, depth + 1)}</div></div>`
        ).join("")
      : `<p class="tutor-empty">Empty dict</p>`;
  } else if (object.attrs) {
    const attrs = Object.entries(object.attrs);
    inner = attrs.length
      ? attrs.map(([name, value]) =>
          `<div class="focus-entry"><span class="heap-dict-key">${escapeHtml(name)}</span><span class="heap-dict-arrow">=</span><div>${renderFocusValue(value, heap, labels, stack, depth + 1)}</div></div>`
        ).join("")
      : `<p class="tutor-empty">No attributes</p>`;
  } else {
    inner = `<p class="tutor-empty">Empty</p>`;
  }
  stack.delete(encoded.id);
  return `<div class="focus-card"><div class="focus-card-type">${escapeHtml(object.type)}</div><div class="focus-card-body">${inner}</div></div>`;
}

function resolveFocusedVar(focus, frames, heap, labels) {
  if (!focus) return null;
  if (focus.kind === "local") {
    const frame = frames?.[focus.frameIndex];
    const encoded = frame?.locals?.[focus.name];
    if (!frame || !encoded) return { missing: true, kicker: "Variable", label: focus.name };
    const typeName = encoded.kind === "ref" ? heap?.[encoded.id]?.type : encoded.type;
    return { kicker: frame.name, label: focus.name, typeName, encoded };
  }
  if (focus.kind === "heap") {
    const object = heap?.[focus.id];
    if (!object) return { missing: true, kicker: "Object", label: focus.label || "object" };
    return { kicker: object.type, label: focus.label || labelForRef(focus.id, heap, labels), typeName: object.type, encoded: { kind: "ref", id: focus.id } };
  }
  if (focus.kind === "component") {
    const object = heap?.[focus.parentId];
    if (!object) return { missing: true, kicker: "Value", label: focus.label || "value" };
    let encoded = null;
    if (focus.part === "element") encoded = object.elements?.[Number(focus.index)];
    else if (focus.part === "entry") encoded = object.entries?.[Number(focus.index)]?.[1];
    else if (focus.part === "entry-key") encoded = object.entries?.[Number(focus.index)]?.[0];
    else if (focus.part === "attr") encoded = object.attrs?.[focus.index];
    if (!encoded) return { missing: true, kicker: "Value", label: focus.label || "value" };
    const typeName = encoded.kind === "ref" ? heap?.[encoded.id]?.type : encoded.type;
    return { kicker: typeName || "Value", label: focus.label || "value", typeName, encoded };
  }
  return null;
}

function renderFocusedVar(focus, frames, heap, labels) {
  const resolved = resolveFocusedVar(focus, frames, heap, labels);
  tutorVarFocusKicker.textContent = resolved?.kicker || "Variable";
  tutorVarFocusTitle.textContent = resolved?.label || "Variable";
  if (!resolved || resolved.missing) {
    tutorVarFocusBody.innerHTML = `<p class="tutor-empty">This variable is not in memory at this step.</p>`;
    return;
  }
  tutorVarFocusBody.innerHTML = renderFocusValue(resolved.encoded, heap, labels, new Set(), 0);
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

// ---------------------------------------------------------------------------
// Graph View
// ---------------------------------------------------------------------------

const GRAPH_NAME_PATTERN = /graph|adj|neighbo|network|connection|edge|route|flight|friend|road|link|follow|prereq|depend|^g$/i;
const GRAPH_EDGE_LIST_PATTERN = /edge|pair|connection|prereq|depend|route|flight|road|link/i;
const GRAPH_MATRIX_REJECT_PATTERN = /grid|board|maze|image|dp|memo/i;
const GRAPH_OBJECT_ATTRS = ["neighbors", "neighbours", "adj", "adjacent", "edges", "connections", "links"];
// Integers are everywhere (counters, lengths), so int-labeled nodes only get pointer tags from node-like names.
const GRAPH_INT_POINTER_PATTERN = /node|vert|neighbo|nbr|nei|start|end|src|source|dst|dest|target|goal|parent|child|^(u|v|w|x|y|i|j|cur|curr|current)$/i;
const GRAPH_NEIGHBOR_POINTER_PATTERN = /neighbo|nbr|nei|child|adj|next|^(v|w|to|dst|dest)$/i;
const GRAPH_ENDPOINT_POINTER_PATTERN = /start|source|src|root|begin|target|goal|end/i;
const VISITED_NAME_PATTERN = /^(visited|seen|explored|done|marked|vis|discovered|closed|visit)$/i;
const GRAPH_KIND_LABELS = {
  dict: "adjacency list (dict)",
  objects: "node objects",
  adjlist: "adjacency list (list of lists)",
  matrix: "adjacency matrix",
  edges: "edge list"
};
const GRAPH_KIND_RANK = { dict: 0, objects: 0, adjlist: 1, matrix: 1, edges: 2 };
const GRAPH_REPRS = { list: "Adjacency List", matrix: "Adjacency Matrix" };
const GRAPH_ZOOM_MIN = 25;
const GRAPH_ZOOM_MAX = 400;
const GRAPH_ZOOM_STEP = 10;
const GRAPH_ZOOM_DEFAULT = 100;
const GRAPH_SEARCH_MODES = { bfs: "BFS", dfs: "DFS" };
const BFS_FRONTIER_PATTERN = /^(q|queue|que|dq|deque|frontier|to_visit|bfs)$/i;
const DFS_STACK_PATTERN = /^(stack|stk|dfs)$/i;
const DFS_FRAME_PATTERN = /^(explore|dfs|walk|search|visit)\(\)$/i;

function stripQuotes(text) {
  return text.length >= 2 && text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
}

function isNumericPrimitive(encoded) {
  return encoded?.kind === "primitive" && (encoded.type === "int" || encoded.type === "float");
}

function graphNodeRef(encoded, heap, allowTuple) {
  if (!encoded) return null;
  if (encoded.kind === "primitive") {
    if (encoded.type !== "str" && encoded.type !== "int") return null;
    return { key: `${encoded.type}:${encoded.value}`, label: stripQuotes(encoded.value) };
  }
  const object = heap[encoded.id];
  if (!object) return null;
  if (isInstance(object)) return { key: `obj:${encoded.id}`, label: treeNodeValue(object), objId: encoded.id };
  if (allowTuple && object.type === "tuple" && object.elements.every((item) => item?.kind === "primitive")) {
    const label = `(${object.elements.map((item) => stripQuotes(item.value)).join(",")})`;
    return { key: `tuple:${label}`, label };
  }
  return null;
}

function parseNeighbor(encoded, heap, tupleNodes) {
  const direct = graphNodeRef(encoded, heap, tupleNodes);
  if (direct) return { node: direct, weight: null };
  if (encoded?.kind !== "ref") return null;
  const pair = heap[encoded.id];
  if (!pair?.elements || pair.elements.length !== 2 || (pair.type !== "tuple" && pair.type !== "list")) return null;
  const node = graphNodeRef(pair.elements[0], heap, false);
  if (!node || !isNumericPrimitive(pair.elements[1])) return null;
  return { node, weight: pair.elements[1].value };
}

function createGraphBuilder() {
  const nodes = new Map();
  const adjacency = new Map();
  return {
    nodes,
    adjacency,
    addNode(ref) {
      if (!nodes.has(ref.key)) {
        nodes.set(ref.key, ref);
        adjacency.set(ref.key, []);
      }
      return ref.key;
    },
    addEdge(fromRef, toRef, weight) {
      const from = this.addNode(fromRef);
      const to = this.addNode(toRef);
      adjacency.get(from).push({ to, weight });
    }
  };
}

function finishGraph(builder, meta) {
  const { adjacency } = builder;
  const hasEdge = (from, to, weight) => (adjacency.get(from) || []).some((edge) => edge.to === to && edge.weight === weight);

  if (meta.forceUndirected) {
    [...adjacency.entries()].forEach(([from, list]) => {
      [...list].forEach((edge) => {
        if (!hasEdge(edge.to, from, edge.weight)) adjacency.get(edge.to).push({ to: from, weight: edge.weight });
      });
    });
  }

  let directed = false;
  adjacency.forEach((list, from) => {
    if (list.some((edge) => !hasEdge(edge.to, from, edge.weight))) directed = true;
  });
  const weighted = [...adjacency.values()].some((list) => list.some((edge) => edge.weight !== null));
  const nodes = [...builder.nodes.values()];
  return { ...meta, nodes, nodeKeys: new Set(nodes.map((node) => node.key)), adjacency, directed, weighted };
}

function detectDictGraph(name, object, heap) {
  if (!object.entries?.length) return null;
  const tupleNodes = object.entries.every(([key]) => key?.kind === "ref" && heap[key.id]?.type === "tuple");
  const keyRefs = object.entries.map(([key]) => graphNodeRef(key, heap, tupleNodes));
  if (keyRefs.some((ref) => !ref)) return null;

  const builder = createGraphBuilder();
  keyRefs.forEach((ref) => builder.addNode(ref));
  let overlap = false;

  for (let index = 0; index < object.entries.length; index++) {
    const value = object.entries[index][1];
    const container = value?.kind === "ref" ? heap[value.id] : null;
    let neighbors;
    if (container?.elements) {
      neighbors = container.elements.map((item) => parseNeighbor(item, heap, tupleNodes));
    } else if (container?.entries) {
      neighbors = container.entries.map(([key, weight]) => {
        const node = graphNodeRef(key, heap, tupleNodes);
        if (!node || !(isNumericPrimitive(weight) || weight?.type === "bool")) return null;
        return { node, weight: weight.type === "bool" ? null : weight.value };
      });
    } else {
      return null;
    }
    if (neighbors.some((neighbor) => !neighbor)) return null;
    neighbors.forEach((neighbor) => {
      if (builder.nodes.has(neighbor.node.key)) overlap = true;
      builder.addEdge(keyRefs[index], neighbor.node, neighbor.weight);
    });
  }

  if (!overlap && !GRAPH_NAME_PATTERN.test(name)) return null;
  return finishGraph(builder, { kind: "dict", native: "list" });
}

function detectEdgeList(name, rows, heap) {
  const builder = createGraphBuilder();
  for (const row of rows) {
    if (row.elements.length !== 2 && row.elements.length !== 3) return null;
    const from = graphNodeRef(row.elements[0], heap, false);
    const to = graphNodeRef(row.elements[1], heap, false);
    const weight = row.elements[2];
    if (!from || !to || (weight && !isNumericPrimitive(weight))) return null;
    builder.addEdge(from, to, weight ? weight.value : null);
  }
  const forceUndirected = !/prereq|depend|follow|dag|topo|directed/i.test(name);
  return finishGraph(builder, { kind: "edges", native: "list", forceUndirected });
}

function intNode(index) {
  return { key: `int:${index}`, label: String(index) };
}

function detectListGraph(name, object, heap) {
  const rows = object.elements.map((item) => (item?.kind === "ref" ? heap[item.id] : null));
  if (!rows.length || rows.some((row) => !row?.elements)) return null;
  const n = rows.length;

  const tupleRows = rows.every((row) => row.type === "tuple" && row.elements.every((item) => item?.kind === "primitive"));
  if (GRAPH_EDGE_LIST_PATTERN.test(name) || tupleRows) {
    const edges = detectEdgeList(name, rows, heap);
    if (edges) return edges;
  }

  const square = rows.every((row) => row.elements.length === n);
  const numeric = rows.every((row) => row.elements.every((cell) => isNumericPrimitive(cell) || cell?.type === "bool"));
  if (square && numeric && n >= 2 && !GRAPH_MATRIX_REJECT_PATTERN.test(name)) {
    const isOff = (cell) => ["0", "0.0", "False", "inf"].includes(cell.value);
    const binary = rows.every((row) => row.elements.every((cell) => ["0", "1", "True", "False"].includes(cell.value)));
    const symmetricNoLoops = rows.every((row, r) =>
      isOff(row.elements[r]) && row.elements.every((cell, c) => cell.value === rows[c].elements[r].value));
    if (GRAPH_NAME_PATTERN.test(name) || (binary && symmetricNoLoops)) {
      const builder = createGraphBuilder();
      rows.forEach((_, index) => builder.addNode(intNode(index)));
      rows.forEach((row, r) => row.elements.forEach((cell, c) => {
        if (!isOff(cell)) builder.addEdge(intNode(r), intNode(c), binary ? null : cell.value);
      }));
      return finishGraph(builder, { kind: "matrix", native: "matrix" });
    }
  }

  const neighborRows = rows.map((row) => row.elements.map((item) => parseNeighbor(item, heap, false)));
  const inRange = neighborRows.every((list) => list.every((neighbor) => {
    if (!neighbor?.node.key.startsWith("int:")) return false;
    const index = Number(neighbor.node.label);
    return index >= 0 && index < n;
  }));
  if (inRange && neighborRows.some((list) => list.length) && (GRAPH_NAME_PATTERN.test(name) || !square)) {
    const builder = createGraphBuilder();
    rows.forEach((_, index) => builder.addNode(intNode(index)));
    neighborRows.forEach((list, index) => list.forEach((neighbor) => builder.addEdge(intNode(index), neighbor.node, neighbor.weight)));
    return finishGraph(builder, { kind: "adjlist", native: "list" });
  }
  return null;
}

function detectObjectGraph(heap) {
  const instances = Object.values(heap || {}).filter(isInstance);
  const neighborItems = (object) => GRAPH_OBJECT_ATTRS.flatMap((attr) => {
    const value = object.attrs[attr];
    const container = value?.kind === "ref" ? heap[value.id] : null;
    return container?.elements || [];
  });
  const types = new Set();
  instances.forEach((object) => {
    if (neighborItems(object).some((item) => item?.kind === "ref" && heap[item.id]?.type === object.type)) types.add(object.type);
  });
  if (!types.size) return null;

  const builder = createGraphBuilder();
  const nodes = instances.filter((object) => types.has(object.type));
  nodes.forEach((object) => builder.addNode({ key: `obj:${object.id}`, label: treeNodeValue(object), objId: object.id }));
  nodes.forEach((object) => {
    neighborItems(object).forEach((item) => {
      if (item?.kind !== "ref" || !types.has(heap[item.id]?.type)) return;
      builder.addEdge(builder.nodes.get(`obj:${object.id}`), builder.nodes.get(`obj:${item.id}`), null);
    });
  });
  return finishGraph(builder, { kind: "objects", native: "list" });
}

function findGraphs(frames, heap, labels) {
  const found = [];
  const seen = new Set();
  const consider = (name, encoded) => {
    if (encoded?.kind !== "ref" || seen.has(encoded.id)) return;
    const object = heap[encoded.id];
    let graph = null;
    if (object?.entries) graph = detectDictGraph(name, object, heap);
    else if (object?.elements && (object.type === "list" || object.type === "tuple")) graph = detectListGraph(name, object, heap);
    if (!graph) return;
    seen.add(encoded.id);
    found.push({ ...graph, name, id: encoded.id });
  };

  [...(frames || [])].reverse().forEach((frame) => {
    Object.entries(frame.locals || {}).forEach(([name, value]) => consider(name, value));
  });
  Object.values(heap || {}).forEach((object) => {
    if (!isInstance(object)) return;
    Object.entries(object.attrs).forEach(([name, value]) => consider(`${labelForRef(object.id, heap, labels)}.${name}`, value));
  });

  const objectGraph = detectObjectGraph(heap);
  if (objectGraph) {
    const typeName = heap[objectGraph.nodes[0].objId].type;
    found.push({ ...objectGraph, name: `${typeName} objects`, id: "objects" });
  }

  return found.sort((a, b) => GRAPH_KIND_RANK[a.kind] - GRAPH_KIND_RANK[b.kind]);
}

function graphNodeKeyFor(encoded, graph, heap) {
  const ref = graphNodeRef(encoded, heap, true);
  if (ref && graph.nodeKeys.has(ref.key)) return ref.key;
  const wrapper = encoded?.kind === "ref" ? heap[encoded.id] : null;
  if (wrapper?.elements?.length && (wrapper.type === "tuple" || wrapper.type === "list")) {
    const first = graphNodeRef(wrapper.elements[0], heap, false);
    if (first && graph.nodeKeys.has(first.key)) return first.key;
  }
  return null;
}

function collectGraphPointers(frames, graph, heap) {
  const pointers = new Map();
  (frames || []).forEach((frame, index) => {
    const kind = index === frames.length - 1 ? "active" : "outer";
    Object.entries(frame.locals || {}).forEach(([name, value]) => {
      if (name === graph.name) return;
      const ref = graphNodeRef(value, heap, true);
      if (!ref || !graph.nodeKeys.has(ref.key)) return;
      if (ref.key.startsWith("int:") && !GRAPH_INT_POINTER_PATTERN.test(name)) return;
      if (!pointers.has(ref.key)) pointers.set(ref.key, []);
      const list = pointers.get(ref.key);
      if (!list.some((pointer) => pointer.name === name && pointer.kind === kind)) list.push({ name, kind });
    });
  });
  pointers.forEach((list) => list.sort((a, b) => (a.kind === "active" ? -1 : 0) - (b.kind === "active" ? -1 : 0)));
  return pointers;
}

function graphFocus(graph, pointers) {
  const current = new Set();
  const neighbors = new Set();
  pointers.forEach((list, key) => {
    list.filter((pointer) => pointer.kind === "active").forEach(({ name }) => {
      if (GRAPH_NEIGHBOR_POINTER_PATTERN.test(name)) neighbors.add(key);
      else if (!GRAPH_ENDPOINT_POINTER_PATTERN.test(name)) current.add(key);
    });
  });
  const isFocusEdge = (from, to) =>
    from !== to && ((current.has(from) && neighbors.has(to)) || (!graph.directed && current.has(to) && neighbors.has(from)));
  return { current, neighbors, isFocusEdge };
}

function collectGraphMarks(frames, graph, heap) {
  const visited = new Set();
  const queued = new Set();
  const sources = [];
  const seen = new Set();
  [...(frames || [])].reverse().forEach((frame) => {
    Object.entries(frame.locals || {}).forEach(([name, value]) => {
      if (value?.kind !== "ref" || seen.has(value.id)) return;
      const container = heap[value.id];
      if (!container) return;
      if (VISITED_NAME_PATTERN.test(name)) {
        seen.add(value.id);
        sources.push({ name, kind: "visited" });
        if (container.entries) {
          container.entries.forEach(([key]) => {
            const nodeKey = graphNodeKeyFor(key, graph, heap);
            if (nodeKey) visited.add(nodeKey);
          });
        } else if (container.elements?.every((item) => item?.kind === "primitive" && item.type === "bool")) {
          container.elements.forEach((item, index) => item.value === "True" && graph.nodeKeys.has(`int:${index}`) && visited.add(`int:${index}`));
        } else {
          (container.elements || []).forEach((item) => {
            const nodeKey = graphNodeKeyFor(item, graph, heap);
            if (nodeKey) visited.add(nodeKey);
          });
        }
      } else if (QUEUE_NAME_PATTERN.test(name) && container.elements) {
        seen.add(value.id);
        sources.push({ name, kind: "queued" });
        container.elements.forEach((item) => {
          const nodeKey = graphNodeKeyFor(item, graph, heap);
          if (nodeKey) queued.add(nodeKey);
        });
      }
    });
  });
  return { visited, queued, sources };
}

function graphEdgeList(graph) {
  const edges = [];
  const drawn = new Set();
  graph.adjacency.forEach((list, from) => {
    list.forEach(({ to, weight }) => {
      const id = graph.directed || from === to ? `${from}->${to}` : [from, to].sort().join("--");
      if (drawn.has(id)) return;
      drawn.add(id);
      edges.push({ from, to, weight });
    });
  });
  return edges;
}

function graphSearchModeFor(tab) {
  return GRAPH_SEARCH_MODES[tab?.graphSearch] ? tab.graphSearch : "bfs";
}

function clampGraphZoom(value) {
  const parsed = Number.parseInt(String(value ?? "").replace(/[^\d-]/g, ""), 10);
  if (!Number.isFinite(parsed)) return GRAPH_ZOOM_DEFAULT;
  return Math.min(GRAPH_ZOOM_MAX, Math.max(GRAPH_ZOOM_MIN, parsed));
}

function graphZoomFor(tab) {
  return clampGraphZoom(tab?.graphZoom ?? GRAPH_ZOOM_DEFAULT);
}

function scaleGraphSvg(root, bar, input, zoom) {
  const svg = root?.querySelector(".graph-svg");
  if (!svg) {
    if (bar) bar.hidden = true;
    return;
  }
  if (bar) bar.hidden = false;
  if (input && document.activeElement !== input) input.value = String(zoom);
  const scale = zoom / 100;
  const width = Number(svg.dataset.baseWidth) || svg.viewBox.baseVal.width;
  const height = Number(svg.dataset.baseHeight) || svg.viewBox.baseVal.height;
  svg.style.width = `${width * scale}px`;
  svg.style.height = `${height * scale}px`;
}

function applyGraphZoom(tab = getActiveTab()) {
  const zoom = graphZoomFor(tab);
  if (tab) tab.graphZoom = zoom;
  scaleGraphSvg(tutorGraphCanvas, graphZoomBar, graphZoomInput, zoom);
  scaleGraphSvg(tutorPathCanvas, pathZoomBar, pathZoomInput, zoom);
}

function setGraphZoom(value) {
  const tab = getActiveTab();
  if (!tab) return;
  tab.graphZoom = clampGraphZoom(value);
  applyGraphZoom(tab);
}

function bumpGraphZoom(delta) {
  const tab = getActiveTab();
  if (!tab) return;
  setGraphZoom(graphZoomFor(tab) + delta);
}

function nodeLabelFromKey(graph, key) {
  return graph.nodes.find((node) => node.key === key)?.label ?? "?";
}

function graphFrontierItems(encoded, graph, heap) {
  if (encoded?.kind !== "ref") {
    const key = graphNodeKeyFor(encoded, graph, heap);
    return key ? [{ key, label: nodeLabelFromKey(graph, key) }] : [];
  }
  const container = heap[encoded.id];
  if (!container?.elements) {
    const key = graphNodeKeyFor(encoded, graph, heap);
    return key ? [{ key, label: nodeLabelFromKey(graph, key) }] : [];
  }
  return container.elements.flatMap((item) => {
    const key = graphNodeKeyFor(item, graph, heap);
    return key ? [{ key, label: nodeLabelFromKey(graph, key) }] : [];
  });
}

function findNamedFrontier(frames, graph, heap, namePattern) {
  let found = null;
  [...(frames || [])].reverse().forEach((frame) => {
    Object.entries(frame.locals || {}).forEach(([name, value]) => {
      if (found || !namePattern.test(name) || value?.kind !== "ref") return;
      const container = heap[value.id];
      if (!container?.elements || container.type === "set" || container.type === "frozenset") return;
      found = { name, items: graphFrontierItems(value, graph, heap) };
    });
  });
  return found;
}

function findDequeFrontier(frames, graph, heap) {
  for (const frame of [...(frames || [])].reverse()) {
    for (const [name, value] of Object.entries(frame.locals || {})) {
      if (value?.kind !== "ref") continue;
      const object = heap[value.id];
      if (object?.type !== "deque") continue;
      return { name, items: graphFrontierItems(value, graph, heap) };
    }
  }
  return null;
}

function collectRecursiveNodes(frames, graph, heap) {
  const items = [];
  (frames || []).forEach((frame) => {
    if (!DFS_FRAME_PATTERN.test(frame.name)) return;
    const match = Object.entries(frame.locals || {}).find(([name, value]) => {
      if (!/^(node|curr|current|cur|u|v)$/i.test(name)) return false;
      return Boolean(graphNodeKeyFor(value, graph, heap));
    });
    if (!match) return;
    const key = graphNodeKeyFor(match[1], graph, heap);
    items.push({ key, label: nodeLabelFromKey(graph, key) });
  });
  return items;
}

function collectSearchState(frames, graph, heap, marks, mode) {
  const visited = [];
  const seenKeys = new Set();
  const addVisited = (key) => {
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    visited.push({ key, label: nodeLabelFromKey(graph, key) });
  };
  const visitedLocal = [...(frames || [])].reverse().flatMap((frame) =>
    Object.entries(frame.locals || {}).filter(([name, value]) => VISITED_NAME_PATTERN.test(name) && value?.kind === "ref")
  )[0];
  if (visitedLocal) graphFrontierItems(visitedLocal[1], graph, heap).forEach((item) => addVisited(item.key));
  marks.visited.forEach(addVisited);

  let frontier = { name: mode === "bfs" ? "queue" : "call stack", items: [] };
  if (mode === "bfs") {
    frontier = findNamedFrontier(frames, graph, heap, BFS_FRONTIER_PATTERN)
      || findDequeFrontier(frames, graph, heap)
      || frontier;
  } else {
    const stack = findNamedFrontier(frames, graph, heap, DFS_STACK_PATTERN);
    const recursive = collectRecursiveNodes(frames, graph, heap);
    if (recursive.length) frontier = { name: "call stack", items: recursive };
    else if (stack) frontier = stack;
  }

  const nextIndex = mode === "bfs" ? 0 : frontier.items.length - 1;
  const next = frontier.items[nextIndex] || null;
  return { visited, frontier, next, nextIndex, mode };
}

function renderGraphSearch(search) {
  const chips = (items, nextKey) => items.length
    ? items.map((item) =>
        `<span class="graph-search-chip${item.key === nextKey ? " next" : ""}">${escapeHtml(item.label)}</span>`
      ).join("")
    : `<span class="graph-search-empty">none</span>`;
  const nextKey = search.next?.key;
  const frontierTitle = search.mode === "bfs" ? search.frontier.name : search.frontier.name;
  const nextTag = search.mode === "bfs" ? "front" : "current";
  tutorGraphSearch.hidden = false;
  tutorGraphSearch.innerHTML = `
    <div class="graph-search-block">
      <div class="graph-search-label">Visited</div>
      <div class="graph-search-chips">${chips(search.visited)}</div>
    </div>
    <div class="graph-search-block">
      <div class="graph-search-label">${escapeHtml(frontierTitle)}${search.next ? ` · ${nextTag} ${escapeHtml(search.next.label)}` : ""}</div>
      <div class="graph-search-chips">${chips(search.frontier.items, nextKey)}</div>
    </div>
    <p class="graph-search-hint">${search.mode === "bfs" ? "BFS next = front of the queue" : "DFS next = current recursive call"}</p>
  `;
}

function renderGraphReprToolbar(repr, searchMode) {
  return `
    <div class="graph-toolbar-row">
      <div class="traversal-toolbar">
        <span class="traversal-label">Show as</span>
        <div class="tutor-view-toggle traversal-toggle" role="tablist" aria-label="Graph representation">
          ${Object.entries(GRAPH_REPRS).map(([option, label]) => `
            <button class="view-toggle-button${option === repr ? " active" : ""}" type="button" role="tab" aria-selected="${option === repr}" data-graph-repr="${option}">${label}</button>`).join("")}
        </div>
      </div>
      <div class="traversal-toolbar">
        <span class="traversal-label">Search</span>
        <div class="tutor-view-toggle traversal-toggle" role="tablist" aria-label="Search algorithm">
          ${Object.entries(GRAPH_SEARCH_MODES).map(([option, label]) => `
            <button class="view-toggle-button${option === searchMode ? " active" : ""}" type="button" role="tab" aria-selected="${option === searchMode}" data-graph-search="${option}">${label}</button>`).join("")}
        </div>
      </div>
    </div>`;
}

function renderGraphLegend(frames, graphs, graph, marks, edgeCount, repr, searchMode) {
  const activeFrame = frames?.[frames.length - 1];
  const frameName = activeFrame ? escapeHtml(activeFrame.name) : "—";
  const markNames = (kind) => marks.sources.filter((source) => source.kind === kind).map((source) => source.name).join(", ");
  const traits = [
    graph.directed ? "directed" : "undirected",
    graph.weighted ? "weighted" : "unweighted",
    `${graph.nodes.length} node${graph.nodes.length === 1 ? "" : "s"}`,
    `${edgeCount} edge${edgeCount === 1 ? "" : "s"}`
  ].join(" · ");
  const picker = graphs.length > 1
    ? `<div class="tree-legend-row"><span class="traversal-label">Graph</span>${graphs.map((option) => `
        <button class="graph-source-button${option === graph ? " active" : ""}" type="button" data-graph-source="${escapeHtml(option.name)}">${escapeHtml(option.name)}</button>`).join("")}</div>`
    : "";

  tutorGraphLegend.innerHTML = `
    ${picker}
    <div class="tree-legend-row">
      <span class="tree-chip active"><strong>${escapeHtml(graph.name)}</strong> ${escapeHtml(GRAPH_KIND_LABELS[graph.kind])}</span>
      <span class="graph-traits">${traits}</span>
    </div>
    <div class="tree-legend-row">
      <span class="tree-key"><span class="tree-swatch active"></span>Variable in ${frameName}</span>
      <span class="tree-key"><span class="tree-swatch outer"></span>Variable in an outer frame</span>
      ${markNames("visited") ? `<span class="tree-key"><span class="tree-swatch visited"></span>In ${escapeHtml(markNames("visited"))}</span>` : ""}
      ${markNames("queued") ? `<span class="tree-key"><span class="tree-swatch queued"></span>In ${escapeHtml(markNames("queued"))}</span>` : ""}
    </div>
    ${renderGraphReprToolbar(repr, searchMode)}
  `;
}

function curvedEdgeGeometry(from, to, radius, offset, arrowGap) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const control = {
    x: (from.x + to.x) / 2 - (dy / length) * offset,
    y: (from.y + to.y) / 2 + (dx / length) * offset
  };
  const toward = (point, target, distance) => {
    const vx = target.x - point.x;
    const vy = target.y - point.y;
    const d = Math.hypot(vx, vy) || 1;
    return { x: point.x + (vx / d) * distance, y: point.y + (vy / d) * distance };
  };
  const start = toward(from, control, radius);
  const end = toward(to, control, radius + arrowGap);
  const mid = {
    x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
    y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y
  };
  return { path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`, mid };
}

function renderGraphSvg(graph, pointers, marks, nextKey, overlay = null, markerPrefix = "graph") {
  const count = graph.nodes.length;
  const longest = Math.max(...graph.nodes.map((node) => Math.min(node.label.length, 8)));
  const radius = Math.max(16, Math.min(30, 7 + longest * 3.8));
  const ring = count <= 1 ? 0 : Math.max(80, (count * (radius * 2 + 30)) / (2 * Math.PI));
  const positions = new Map();
  graph.nodes.forEach((node, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(count, 1);
    positions.set(node.key, { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring, ux: Math.cos(angle), uy: Math.sin(angle) });
  });

  const bounds = { minX: -radius, maxX: radius, minY: -radius, maxY: radius };
  const grow = (x, y) => {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
  };

  const focus = graphFocus(graph, pointers);
  const onManagedPath = (from, to) => overlay?.pathEdges?.has(`${from}\0${to}`) || overlay?.pathEdges?.has(`${to}\0${from}`);
  const edgeSvg = graphEdgeList(graph).map(({ from, to, weight }) => {
    const a = positions.get(from);
    const b = positions.get(to);
    const managed = onManagedPath(from, to);
    const active = !managed && focus.isFocusEdge(from, to) ? " active" : "";
    const pathClass = managed ? " path" : "";
    const markerName = managed ? `${markerPrefix}-arrow-path` : active ? `${markerPrefix}-arrow-active` : `${markerPrefix}-arrow`;
    const marker = graph.directed ? ` marker-end="url(#${markerName})"` : "";
    let path;
    let mid;
    if (from === to) {
      const cx = a.x + a.ux * (radius + 10);
      const cy = a.y + a.uy * (radius + 10);
      grow(cx - 12, cy - 12);
      grow(cx + 12, cy + 12);
      path = `M ${cx - 0.01} ${cy - 11} A 11 11 0 1 1 ${cx} ${cy - 11}`;
      mid = { x: cx + a.ux * 18, y: cy + a.uy * 18 };
    } else {
      const reciprocal = graph.directed && graph.adjacency.get(to)?.some((edge) => edge.to === from);
      ({ path, mid } = curvedEdgeGeometry(a, b, radius, reciprocal ? 16 : 0, graph.directed ? 2 : 0));
    }
    const label = weight !== null && weight !== undefined
      ? `<g class="graph-weight"><rect x="${mid.x - (String(weight).length * 3.6 + 5)}" y="${mid.y - 8}" width="${String(weight).length * 7.2 + 10}" height="16" rx="5" /><text x="${mid.x}" y="${mid.y + 4}">${escapeHtml(weight)}</text></g>`
      : "";
    return `<path class="graph-edge${active}${pathClass}" d="${path}"${marker} />${label}`;
  }).join("");

  const nodeSvg = graph.nodes.map((node) => {
    const { x, y, ux, uy } = positions.get(node.key);
    grow(x - radius - 6, y - radius - 6);
    grow(x + radius + 6, y + radius + 6);
    const nodePointers = pointers.get(node.key) || [];
    const state = nodePointers.some((p) => p.kind === "active") ? "active" : nodePointers.length ? "outer" : "";
    const onPath = overlay?.pathNodes?.has(node.key);
    const classes = ["tree-node", state, marks.visited.has(node.key) ? "visited" : "", onPath ? "on-path" : "", onPath && node.key === overlay?.tip ? "tip" : ""].filter(Boolean).join(" ");
    const shownLabel = node.label.length > 8 ? `${node.label.slice(0, 7)}…` : node.label;
    const cost = overlay?.dist?.get(node.key);
    const costSvg = cost == null
      ? ""
      : `<text class="graph-cost" x="${x}" y="${y - radius - 8}">${escapeHtml(formatPathCost(cost))}</text>`;
    if (cost != null) grow(x, y - radius - 16);

    let pointerSvg = "";
    if (nodePointers.length) {
      const text = [...new Set(nodePointers.map((p) => p.name))].join(", ");
      const shown = text.length > 16 ? `${text.slice(0, 15)}…` : text;
      const width = shown.length * 6.6 + 12;
      const px = count <= 1 ? x : x + ux * (radius + 10 + (width / 2) * Math.abs(ux));
      const py = count <= 1 ? y + radius + 16 : y + uy * (radius + 16);
      grow(px - width / 2, py - 9);
      grow(px + width / 2, py + 9);
      pointerSvg = `
        <g class="tree-pointer ${state}">
          <title>${escapeHtml(text)}</title>
          <rect x="${px - width / 2}" y="${py - 8.5}" width="${width}" height="17" rx="8.5" />
          <text x="${px}" y="${py + 4}">${escapeHtml(shown)}</text>
        </g>`;
    }
    const ring = marks.queued.has(node.key) || node.key === nextKey
      ? `<circle class="tree-queue-ring${node.key === nextKey ? " next" : ""}" cx="${x}" cy="${y}" r="${radius + 5}" />`
      : "";
    return `
      ${ring}
      ${costSvg}
      <g class="${classes}">
        <title>${escapeHtml(node.label)}</title>
        <circle cx="${x}" cy="${y}" r="${radius}" />
        <text x="${x}" y="${y + 4.5}">${escapeHtml(shownLabel)}</text>
      </g>
      ${pointerSvg}`;
  }).join("");

  const pad = 14;
  const width = bounds.maxX - bounds.minX + pad * 2;
  const height = bounds.maxY - bounds.minY + pad * 2;
  const arrow = (id) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" /></marker>`;
  return `
    <svg class="tree-svg graph-svg" viewBox="${bounds.minX - pad} ${bounds.minY - pad} ${width} ${height}" data-base-width="${width}" data-base-height="${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Graph diagram">
      <defs>${arrow(`${markerPrefix}-arrow`)}${arrow(`${markerPrefix}-arrow-active`)}${arrow(`${markerPrefix}-arrow-path`)}</defs>
      ${edgeSvg}
      ${nodeSvg}
    </svg>`;
}

function renderGraphAdjacency(graph, pointers, marks, repr) {
  const { current, neighbors, isFocusEdge } = graphFocus(graph, pointers);
  const nodeLabel = (key) => graph.nodes.find((node) => node.key === key)?.label ?? "?";

  let body;
  if (repr === "matrix") {
    const header = graph.nodes.map((node) =>
      `<th class="${neighbors.has(node.key) || current.has(node.key) ? "active" : ""}" title="${escapeHtml(node.label)}">${escapeHtml(node.label)}</th>`).join("");
    const rows = graph.nodes.map((rowNode) => {
      const edges = graph.adjacency.get(rowNode.key) || [];
      const cells = graph.nodes.map((colNode) => {
        const edge = edges.find((candidate) => candidate.to === colNode.key);
        const value = edge ? (edge.weight ?? 1) : 0;
        const classes = [
          edge ? "on" : "",
          current.has(rowNode.key) ? "cross" : "",
          edge && current.has(rowNode.key) && neighbors.has(colNode.key) ? "hit" : ""
        ].filter(Boolean).join(" ");
        return `<td class="${classes}">${escapeHtml(value)}</td>`;
      }).join("");
      return `<tr><th class="${current.has(rowNode.key) ? "active" : ""}" title="${escapeHtml(rowNode.label)}">${escapeHtml(rowNode.label)}</th>${cells}</tr>`;
    }).join("");
    const caption = graph.directed ? "row = from, column = to" : "undirected, so the matrix is symmetric";
    body = `
      <div class="graph-matrix-wrap">
        <table class="graph-matrix"><thead><tr><th class="corner"></th>${header}</tr></thead><tbody>${rows}</tbody></table>
      </div>
      <p class="graph-caption">${caption}</p>`;
  } else {
    body = `<div class="graph-adj-list">${graph.nodes.map((node) => {
      const edges = graph.adjacency.get(node.key) || [];
      const rowActive = current.has(node.key);
      const cells = edges.length
        ? edges.map((edge) => {
            const classes = [
              "graph-adj-cell",
              rowActive && isFocusEdge(node.key, edge.to) ? "active" : "",
              marks.visited.has(edge.to) ? "visited" : ""
            ].filter(Boolean).join(" ");
            const weight = edge.weight !== null ? `<span class="graph-adj-weight">${escapeHtml(edge.weight)}</span>` : "";
            return `<span class="${classes}">${escapeHtml(nodeLabel(edge.to))}${weight}</span>`;
          }).join("")
        : `<span class="graph-adj-empty">[ ]</span>`;
      const rowClasses = ["graph-adj-row", rowActive ? "active" : "", marks.visited.has(node.key) ? "visited" : ""].filter(Boolean).join(" ");
      return `
        <div class="${rowClasses}">
          <span class="graph-adj-node">${escapeHtml(node.label)}</span>
          <span class="graph-adj-arrow">→</span>
          <div class="graph-adj-cells">${cells}</div>
        </div>`;
    }).join("")}</div>`;
  }

  tutorGraphAdjacency.hidden = false;
  tutorGraphAdjacency.innerHTML = body;
}

function renderTutorGraph(frames, heap, labels) {
  const tab = getActiveTab();
  const graphs = findGraphs(frames, heap, labels);
  if (!graphs.length) {
    tutorGraphLegend.innerHTML = "";
    tutorGraphAdjacency.hidden = true;
    tutorGraphSearch.hidden = true;
    if (graphZoomBar) graphZoomBar.hidden = true;
    tutorGraphCanvas.innerHTML = `<p class="tutor-empty">No graph in memory at this step. Graphs are detected from an adjacency list like <code>graph = {"A": ["B", "C"]}</code> (weighted: <code>{"A": {"B": 4}}</code> or <code>[("B", 4)]</code>), a list of neighbor lists like <code>adj = [[1, 2], [0]]</code>, an adjacency <code>matrix</code>, an <code>edges</code> list of pairs, or node objects with a <code>neighbors</code> list.</p>`;
    return;
  }

  const graph = graphs.find((option) => option.name === tab?.graphSource) || graphs[0];
  const pointers = collectGraphPointers(frames, graph, heap);
  const marks = collectGraphMarks(frames, graph, heap);
  const edgeCount = graphEdgeList(graph).length;
  const repr = GRAPH_REPRS[tab?.graphRepr] ? tab.graphRepr : graph.native;
  const searchMode = graphSearchModeFor(tab);
  const search = collectSearchState(frames, graph, heap, marks, searchMode);
  renderGraphLegend(frames, graphs, graph, marks, edgeCount, repr, searchMode);
  tutorGraphCanvas.innerHTML = renderGraphSvg(graph, pointers, marks, search.next?.key);
  applyGraphZoom(tab);
  renderGraphSearch(search);
  renderGraphAdjacency(graph, pointers, marks, repr);
}

// ---------------------------------------------------------------------------
// Path calculation
// A route kept as a list, rebuilt from parent pointers, or carried on a heap.
// ---------------------------------------------------------------------------

const PATH_DIST_NAMES = ["dist", "dists", "distance", "distances", "effort", "efforts", "shortest", "cost", "costs", "best"];
const PATH_PARENT_NAMES = ["parent", "parents", "prev", "previous", "came_from", "predecessor", "pred"];
const PATH_LIST_NAMES = ["path", "route", "trail", "best_path", "shortest_path"];
const PATH_FRONTIER_NAMES = ["heap", "min_heap", "pq", "priority_queue", "frontier", "queue", "q", "deque", "stack"];
const PATH_CURRENT_NAMES = ["node", "current", "curr", "cur", "u"];
const PATH_END_NAMES = ["end", "target", "dest", "dst", "goal", "finish"];

function formatPathCost(value) {
  const text = String(value);
  if (text === "inf" || text === "Infinity") return "∞";
  if (text === "-inf" || text === "-Infinity") return "−∞";
  return text;
}

function nodeKeyOnly(encoded, graph, heap) {
  if (!encoded) return null;
  if (encoded.kind === "primitive") {
    const ref = graphNodeRef(encoded, heap, false);
    return ref && graph.nodeKeys.has(ref.key) ? ref.key : null;
  }
  const object = heap[encoded.id];
  if (!object) return null;
  if (isInstance(object)) {
    const key = `obj:${encoded.id}`;
    return graph.nodeKeys.has(key) ? key : null;
  }
  if (object.type === "tuple" && object.elements.every((item) => item?.kind === "primitive")) {
    const ref = graphNodeRef(encoded, heap, true);
    return ref && graph.nodeKeys.has(ref.key) ? ref.key : null;
  }
  return null;
}

function sequenceOfNodes(encoded, graph, heap) {
  if (encoded?.kind !== "ref") return null;
  const object = heap[encoded.id];
  if (!object?.elements?.length) return null;
  const keys = [];
  for (const item of object.elements) {
    const key = nodeKeyOnly(item, graph, heap);
    if (!key) return null;
    keys.push(key);
  }
  return keys;
}

function numericNodeMap(encoded, graph, heap) {
  if (encoded?.kind !== "ref") return null;
  const object = heap[encoded.id];
  if (!object?.entries?.length) return null;
  const map = new Map();
  for (const [key, value] of object.entries) {
    const node = nodeKeyOnly(key, graph, heap);
    if (!node || !isNumericPrimitive(value)) return null;
    map.set(node, value.value);
  }
  return map.size ? map : null;
}

function numericNodeVector(encoded, graph, heap) {
  if (encoded?.kind !== "ref") return null;
  const object = heap[encoded.id];
  if (!object?.elements?.length) return null;
  if (!graph.nodes.some((node) => node.key.startsWith("int:"))) return null;
  const map = new Map();
  object.elements.forEach((item, index) => {
    const key = `int:${index}`;
    if (graph.nodeKeys.has(key) && isNumericPrimitive(item)) map.set(key, item.value);
  });
  return map.size ? map : null;
}

function isNullParent(encoded) {
  return encoded?.kind === "primitive" && (encoded.value === "None" || encoded.value === "-1");
}

function parentNodeMap(encoded, graph, heap) {
  if (encoded?.kind !== "ref") return null;
  const object = heap[encoded.id];
  if (!object?.entries?.length) return null;
  const map = new Map();
  for (const [key, value] of object.entries) {
    const node = nodeKeyOnly(key, graph, heap);
    if (!node) return null;
    if (isNullParent(value)) {
      map.set(node, null);
      continue;
    }
    const parent = nodeKeyOnly(value, graph, heap);
    if (!parent) return null;
    map.set(node, parent);
  }
  return map.size ? map : null;
}

function parentNodeVector(encoded, graph, heap) {
  if (encoded?.kind !== "ref") return null;
  const object = heap[encoded.id];
  if (!object?.elements?.length) return null;
  if (!graph.nodes.some((node) => node.key.startsWith("int:"))) return null;
  const map = new Map();
  for (let index = 0; index < object.elements.length; index++) {
    const self = `int:${index}`;
    if (!graph.nodeKeys.has(self)) continue;
    const item = object.elements[index];
    if (isNullParent(item)) {
      map.set(self, null);
      continue;
    }
    const parent = nodeKeyOnly(item, graph, heap);
    if (!parent) return null;
    map.set(self, parent);
  }
  return map.size ? map : null;
}

function parseFrontierEntry(encoded, graph, heap) {
  if (!encoded) return null;
  const single = nodeKeyOnly(encoded, graph, heap);
  if (encoded.kind !== "ref") return single ? { cost: null, node: single, path: [single] } : null;
  const object = heap[encoded.id];
  if (!object) return null;
  if (isInstance(object)) return single ? { cost: null, node: single, path: [single] } : null;
  if (!object.elements?.length) return null;

  const els = object.elements;
  const nodeAt = (index) => nodeKeyOnly(els[index], graph, heap);
  const numberAt = (index) => (isNumericPrimitive(els[index]) ? els[index].value : null);
  const pathAt = (index) => sequenceOfNodes(els[index], graph, heap);

  if (els.every((_, index) => nodeAt(index))) {
    const path = els.map((_, index) => nodeAt(index));
    return { cost: null, node: path.at(-1), path };
  }
  if (els.length === 3 && numberAt(0) !== null && nodeAt(1) && pathAt(2)) {
    return { cost: numberAt(0), node: nodeAt(1), path: pathAt(2) };
  }
  if ((els.length === 2 || els.length === 3) && numberAt(0) !== null && pathAt(1)) {
    return { cost: numberAt(0), node: pathAt(1).at(-1), path: pathAt(1) };
  }
  if (els.length === 2 && numberAt(0) !== null && nodeAt(1)) {
    return { cost: numberAt(0), node: nodeAt(1), path: [nodeAt(1)] };
  }
  if (els.length === 2 && nodeAt(0) && numberAt(1) !== null) {
    return { cost: numberAt(1), node: nodeAt(0), path: [nodeAt(0)] };
  }
  if ((els.length === 2 || els.length === 3) && nodeAt(0) && pathAt(1)) {
    return { cost: numberAt(2), node: nodeAt(0), path: pathAt(1) };
  }
  if (els.length === 2 && pathAt(0) && numberAt(1) !== null) {
    return { cost: numberAt(1), node: pathAt(0).at(-1), path: pathAt(0) };
  }
  return null;
}

function frontierEntries(encoded, graph, heap) {
  if (encoded?.kind !== "ref") return null;
  const object = heap[encoded.id];
  if (!object?.elements) return null;
  if (!object.elements.length) return [];
  const entries = [];
  for (const item of object.elements) {
    const entry = parseFrontierEntry(item, graph, heap);
    if (!entry) return null;
    entries.push(entry);
  }
  return entries;
}

function pathRows(frames, graphName) {
  const rows = [];
  [...(frames || [])].reverse().forEach((frame) => {
    Object.entries(frame.locals || {}).forEach(([name, value]) => {
      if (name !== graphName) rows.push({ name, value });
    });
  });
  return rows;
}

function pickNamedValue(rows, names, parse) {
  for (const wanted of names) {
    for (const row of rows) {
      if (row.name.toLowerCase() !== wanted) continue;
      const parsed = parse(row.value);
      if (parsed == null) continue;
      return { name: row.name, parsed };
    }
  }
  return null;
}

function reconstructPath(parents, start) {
  const path = [];
  const seen = new Set();
  let cursor = start;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    path.push(cursor);
    if (!parents.has(cursor) || !parents.get(cursor)) break;
    cursor = parents.get(cursor);
  }
  path.reverse();
  return path;
}

function longestParentChain(parents) {
  let best = [];
  parents.forEach((_, key) => {
    const chain = reconstructPath(parents, key);
    if (chain.length > best.length) best = chain;
  });
  return best;
}

function managedPathEdges(graph, keys) {
  const edges = new Set();
  const linked = (from, to) => (graph.adjacency.get(from) || []).some((edge) => edge.to === to);
  for (let index = 0; index < keys.length - 1; index++) {
    const from = keys[index];
    const to = keys[index + 1];
    if (linked(from, to) || (!graph.directed && linked(to, from))) {
      edges.add(`${from}\0${to}`);
      edges.add(`${to}\0${from}`);
    }
  }
  return edges;
}

function collectPathState(frames, graph, heap) {
  const rows = pathRows(frames, graph.name);
  const dist = pickNamedValue(rows, PATH_DIST_NAMES, (value) => numericNodeMap(value, graph, heap) || numericNodeVector(value, graph, heap));
  const parents = pickNamedValue(rows, PATH_PARENT_NAMES, (value) => parentNodeMap(value, graph, heap) || parentNodeVector(value, graph, heap));
  const listed = pickNamedValue(rows, PATH_LIST_NAMES, (value) => sequenceOfNodes(value, graph, heap));
  const frontier = pickNamedValue(rows, PATH_FRONTIER_NAMES, (value) => frontierEntries(value, graph, heap));
  const current = pickNamedValue(rows, PATH_CURRENT_NAMES, (value) => nodeKeyOnly(value, graph, heap));
  const end = pickNamedValue(rows, PATH_END_NAMES, (value) => nodeKeyOnly(value, graph, heap));

  let path = listed?.parsed || [];
  let pathSource = listed ? listed.name : "";
  let pathCost = null;

  const frontierNext = frontier?.parsed?.length
    ? (/stack|dfs/i.test(frontier.name) ? frontier.parsed.length - 1 : 0)
    : -1;

  if (!path.length && frontier && frontierNext >= 0 && frontier.parsed[frontierNext].path.length > 1) {
    path = frontier.parsed[frontierNext].path;
    pathSource = `${frontier.name}[${frontierNext}]`;
    pathCost = frontier.parsed[frontierNext].cost;
  }

  if (!path.length && parents?.parsed?.size) {
    const table = parents.parsed;
    let anchor = null;
    if (end?.parsed && table.get(end.parsed)) anchor = end.parsed;
    else if (current?.parsed && table.has(current.parsed)) anchor = current.parsed;
    path = anchor ? reconstructPath(table, anchor) : longestParentChain(table);
    if (path.length) pathSource = parents.name;
  }

  if (pathCost == null && dist && path.length) pathCost = dist.parsed.get(path.at(-1)) ?? null;

  return {
    path,
    pathSource,
    pathCost,
    dist: dist ? { name: dist.name, map: dist.parsed } : null,
    parents: parents ? { name: parents.name, map: parents.parsed } : null,
    frontier: frontier ? { name: frontier.name, entries: frontier.parsed, nextIndex: frontierNext } : null,
    current: current?.parsed || null
  };
}

function renderPathState(state, graph) {
  const label = (key) => escapeHtml(nodeLabelFromKey(graph, key));
  const sequence = state.path.length
    ? state.path.map((key, index) =>
        `<span class="graph-search-chip${index === state.path.length - 1 ? " next" : ""}">${label(key)}</span>`
      ).join('<span class="path-arrow">→</span>')
    : `<span class="graph-search-empty">no path yet</span>`;
  const costNote = state.pathCost != null ? ` · ${escapeHtml(formatPathCost(state.pathCost))}` : "";
  const distChips = state.dist
    ? [...state.dist.map.entries()].map(([key, cost]) =>
        `<span class="graph-search-chip${state.path.includes(key) ? " next" : ""}">${label(key)}<span class="path-cost">${escapeHtml(formatPathCost(cost))}</span></span>`
      ).join("")
    : `<span class="graph-search-empty">none</span>`;
  const frontierBody = !state.frontier
    ? `<span class="graph-search-empty">none</span>`
    : state.frontier.entries.length
      ? `<div class="path-frontier">${state.frontier.entries.map((entry, index) => {
          const nodes = entry.path.map((key) => nodeLabelFromKey(graph, key)).join(" → ");
          const cost = entry.cost != null ? escapeHtml(formatPathCost(entry.cost)) : "·";
          return `<div class="path-frontier-row${index === state.frontier.nextIndex ? " next" : ""}"><span class="path-frontier-cost">${cost}</span><span class="path-frontier-nodes">${escapeHtml(nodes)}</span></div>`;
        }).join("")}</div>`
      : `<span class="graph-search-empty">empty</span>`;
  const parentChips = state.parents
    ? [...state.parents.map.entries()].filter(([, parent]) => parent).map(([node, parent]) =>
        `<span class="graph-search-chip">${label(node)} ← ${label(parent)}</span>`
      ).join("") || `<span class="graph-search-empty">none yet</span>`
    : `<span class="graph-search-empty">none</span>`;

  tutorPathState.hidden = false;
  tutorPathState.innerHTML = `
    <div class="graph-search-block">
      <div class="graph-search-label">${escapeHtml(state.pathSource || "path")}${costNote}</div>
      <div class="path-sequence">${sequence}</div>
    </div>
    <div class="graph-search-block">
      <div class="graph-search-label">${escapeHtml(state.dist?.name || "dist")}</div>
      <div class="graph-search-chips">${distChips}</div>
    </div>
    <div class="graph-search-block">
      <div class="graph-search-label">${escapeHtml(state.frontier?.name || "heap / queue")}${state.frontier?.nextIndex >= 0 ? " · next" : ""}</div>
      ${frontierBody}
    </div>
    <div class="graph-search-block">
      <div class="graph-search-label">${escapeHtml(state.parents?.name || "parent")}</div>
      <div class="graph-search-chips">${parentChips}</div>
    </div>
  `;
}

const GRID_EFFORT_PATTERN = /^(effort|efforts|dist|dists|distance|distances|cost|costs|best|dp|memo)$/i;
const GRID_WEIGHT_PATTERN = /^(heights|height|grid|board|maze|weights|weight|terrain|elevation|elevations|field)$/i;
const GRID_DIRECTION_PATTERN = /^(directions|direction|dirs|deltas|delta|moves|offsets|offset)$/i;

function sameShape(a, b) {
  return Boolean(a && b && a.rows === b.rows && a.cols === b.cols);
}

function readNumericGrid(name, encoded, heap) {
  if (PATH_FRONTIER_NAMES.includes(String(name).toLowerCase())) return null;
  if (GRID_DIRECTION_PATTERN.test(name)) return null;
  if (encoded?.kind !== "ref") return null;
  const object = heap[encoded.id];
  if (!object?.elements?.length) return null;
  if (object.type !== "list" && object.type !== "tuple") return null;
  const rowObjects = object.elements.map((item) => (item?.kind === "ref" ? heap[item.id] : null));
  if (rowObjects.some((row) => !row?.elements?.length)) return null;
  if (rowObjects.some((row) => row.type !== "list" && row.type !== "tuple")) return null;
  const cols = rowObjects[0].elements.length;
  if (rowObjects.some((row) => row.elements.length !== cols)) return null;
  if (!rowObjects.every((row) => row.elements.every((cell) => isNumericPrimitive(cell)))) return null;
  const named = GRID_EFFORT_PATTERN.test(name) || GRID_WEIGHT_PATTERN.test(name);
  const tupleRows = rowObjects.every((row) => row.type === "tuple");
  if (tupleRows && cols <= 3 && !named) return null;
  const cells = rowObjects.map((row) => row.elements.map((cell) => cell.value));
  const tinySteps = cols === 2
    && cells.length <= 8
    && cells.flat().every((value) => ["-1", "0", "1", "-1.0", "0.0", "1.0"].includes(value));
  if (tinySteps && !named) return null;
  if (!named && (cells.length < 2 || cols < 2)) return null;
  return { rows: cells.length, cols, cells };
}

function gridLocals(frames) {
  const locals = [];
  const seen = new Set();
  [...(frames || [])].reverse().forEach((frame) => {
    Object.entries(frame.locals || {}).forEach(([name, value]) => {
      if (seen.has(name)) return;
      seen.add(name);
      locals.push({ name, value });
    });
  });
  return locals;
}

function readIntLocal(locals, names) {
  for (const name of names) {
    const found = locals.find((row) => row.name === name);
    if (!found || !isNumericPrimitive(found.value)) continue;
    const n = Number(found.value.value);
    if (Number.isInteger(n)) return n;
  }
  return null;
}

function readNumberLocal(locals, names) {
  for (const name of names) {
    const found = locals.find((row) => row.name === name);
    if (!found || !isNumericPrimitive(found.value)) continue;
    return found.value.value;
  }
  return null;
}

function previewSequence(object, heap) {
  const shown = object.elements.slice(0, 6).map((item) => {
    if (isNumericPrimitive(item)) return item.value;
    const nested = item?.kind === "ref" ? heap[item.id] : null;
    if (nested?.elements?.length === 2 && nested.elements.every((part) => isNumericPrimitive(part))) {
      return `(${nested.elements[0].value},${nested.elements[1].value})`;
    }
    return "…";
  });
  return shown.join("→") + (object.elements.length > 6 ? "…" : "");
}

function describeTuplePart(encoded, heap) {
  if (isNumericPrimitive(encoded)) return { kind: "num", n: Number(encoded.value), text: encoded.value };
  if (encoded?.kind !== "ref") return { kind: "other" };
  const object = heap[encoded.id];
  if (!object?.elements) return { kind: "other" };
  if (object.elements.length === 2 && object.elements.every((part) => isNumericPrimitive(part))) {
    return {
      kind: "pair",
      row: Number(object.elements[0].value),
      col: Number(object.elements[1].value),
      text: `(${object.elements[0].value}, ${object.elements[1].value})`
    };
  }
  return { kind: "seq", text: previewSequence(object, heap) };
}

function tupleParts(encoded, heap) {
  if (encoded?.kind !== "ref") return null;
  const object = heap[encoded.id];
  if (!object?.elements?.length) return null;
  if (object.type !== "tuple" && object.type !== "list") return null;
  return object.elements.map((item) => describeTuplePart(item, heap));
}

function buildGridEntries(partsList, roles) {
  const entries = [];
  for (const parts of partsList) {
    let row = null;
    let col = null;
    let cost = null;
    const slots = parts.map((part, index) => {
      const role = roles[index];
      if (role === "row") row = part.n;
      if (role === "col") col = part.n;
      if (role === "cell") {
        row = part.row;
        col = part.col;
      }
      if (role === "cost") cost = part.text;
      const text = part.kind === "pair" ? `(${part.row}, ${part.col})` : part.text;
      return { role, text };
    });
    if (row == null || col == null) return null;
    entries.push({ slots, row, col, cost, stale: false });
  }
  return entries;
}

function shapePreference(rowPos, colPos, costPos) {
  if (costPos === 0 && rowPos === 1 && colPos === 2) return 0;
  if (rowPos === 0 && colPos === 1 && (costPos === 2 || costPos == null)) return 1;
  if (costPos === 0) return 2;
  return 3 + rowPos + colPos;
}

function scoreGridRoles(partsList, roles, effortCells) {
  if (!effortCells) return 0;
  let score = 0;
  for (const parts of partsList) {
    let row = null;
    let col = null;
    let cost = null;
    parts.forEach((part, index) => {
      const role = roles[index];
      if (role === "row") row = part.n;
      if (role === "col") col = part.n;
      if (role === "cell") {
        row = part.row;
        col = part.col;
      }
      if (role === "cost") cost = part.text;
    });
    if (row == null || col == null || cost == null) continue;
    const have = effortCells[row]?.[col];
    if (have != null && Number(have) === Number(cost)) score += 2;
  }
  return score;
}

function chooseCostPos(rest, rowPos, colPos, partsList, effortCells) {
  if (!rest.length) return null;
  if (!effortCells || rest.length === 1) return rest[0];
  let best = rest[0];
  let bestScore = -1;
  rest.forEach((pos) => {
    let score = 0;
    partsList.forEach((parts) => {
      const have = effortCells[parts[rowPos].n]?.[parts[colPos].n];
      if (have != null && Number(have) === Number(parts[pos].text)) score += 1;
    });
    if (score > bestScore) {
      bestScore = score;
      best = pos;
    }
  });
  return best;
}

function classifyGridTuples(partsList, grid, effortCells) {
  if (!partsList.length) return null;
  const width = partsList[0].length;
  if (!width || partsList.some((parts) => parts.length !== width)) return null;
  if (partsList.some((parts, index) => parts.some((part, slot) => part.kind !== partsList[0][slot].kind))) return null;
  const kinds = partsList[0].map((part) => part.kind);
  if (kinds.some((kind) => kind === "other")) return null;

  const inRow = (n) => Number.isInteger(n) && n >= 0 && n < grid.rows;
  const inCol = (n) => Number.isInteger(n) && n >= 0 && n < grid.cols;
  const numericIdx = kinds.map((kind, index) => (kind === "num" ? index : -1)).filter((index) => index >= 0);
  const pairIdx = kinds.map((kind, index) => (kind === "pair" ? index : -1)).filter((index) => index >= 0);
  const blankRoles = () => kinds.map((kind) => (kind === "seq" ? "path" : "extra"));

  if (pairIdx.length > 1) return null;
  if (pairIdx.length === 1) {
    const cellPos = pairIdx[0];
    if (!partsList.every((parts) => inRow(parts[cellPos].row) && inCol(parts[cellPos].col))) return null;
    const roles = blankRoles();
    roles[cellPos] = "cell";
    if (numericIdx.length) roles[numericIdx[0]] = "cost";
    const entries = buildGridEntries(partsList, roles);
    return entries ? { roles, entries } : null;
  }

  if (kinds.some((kind) => kind === "seq") && numericIdx.length < 3) return null;
  if (numericIdx.length < 2) return null;

  let best = null;
  numericIdx.forEach((rowPos) => {
    numericIdx.forEach((colPos) => {
      if (rowPos === colPos) return;
      if (!partsList.every((parts) => inRow(parts[rowPos].n) && inCol(parts[colPos].n))) return;
      const rest = numericIdx.filter((index) => index !== rowPos && index !== colPos);
      const costPos = chooseCostPos(rest, rowPos, colPos, partsList, effortCells);
      const roles = blankRoles();
      roles[rowPos] = "row";
      roles[colPos] = "col";
      if (costPos != null) roles[costPos] = "cost";
      const score = scoreGridRoles(partsList, roles, effortCells);
      const preference = shapePreference(rowPos, colPos, costPos);
      if (!best || score > best.score || (score === best.score && preference < best.preference)) {
        best = { roles, score, preference };
      }
    });
  });
  if (!best) return null;
  const entries = buildGridEntries(partsList, best.roles);
  return entries ? { roles: best.roles, entries } : null;
}

function parseGridFrontier(encoded, heap, grid, effortCells) {
  if (encoded?.kind !== "ref") return null;
  const object = heap[encoded.id];
  if (!object?.elements) return null;
  if (object.type !== "list" && object.type !== "tuple" && object.type !== "deque") return null;
  if (!object.elements.length) return { entries: [], roles: null };
  const partsList = [];
  for (const item of object.elements) {
    const parts = tupleParts(item, heap);
    if (!parts) return null;
    partsList.push(parts);
  }
  return classifyGridTuples(partsList, grid, effortCells);
}

function matrixRank(matrix) {
  if (GRID_EFFORT_PATTERN.test(matrix.name)) return 0;
  if (GRID_WEIGHT_PATTERN.test(matrix.name)) return 1;
  return 2;
}

function findCoordinateFrontier(locals, heap, matrices, effort) {
  const ordered = [...matrices].sort((a, b) => matrixRank(a) - matrixRank(b));
  let empty = null;
  for (const wanted of PATH_FRONTIER_NAMES) {
    const local = locals.find((row) => row.name.toLowerCase() === wanted);
    if (!local) continue;
    for (const grid of ordered) {
      const effortCells = effort && sameShape(effort, grid) ? effort.cells : null;
      const parsed = parseGridFrontier(local.value, heap, grid, effortCells);
      if (!parsed) continue;
      if (!parsed.entries.length) {
        if (!empty) empty = { name: local.name, grid, parsed };
        break;
      }
      const nextIndex = /stack|dfs/i.test(local.name) ? parsed.entries.length - 1 : 0;
      return { name: local.name, grid, parsed: { ...parsed, nextIndex } };
    }
  }
  if (!empty) return null;
  return { name: empty.name, grid: empty.grid, parsed: { ...empty.parsed, nextIndex: -1 } };
}

function markStaleEntries(entries, effort) {
  if (!effort) return;
  entries.forEach((entry) => {
    const have = effort.cells[entry.row]?.[entry.col];
    entry.stale = entry.cost != null && have != null && Number.isFinite(Number(have)) && Number(entry.cost) > Number(have);
  });
}

function cellInGrid(locals, rowNames, colNames, grid) {
  const row = readIntLocal(locals, rowNames);
  const col = readIntLocal(locals, colNames);
  if (row == null || col == null) return null;
  if (row < 0 || col < 0 || row >= grid.rows || col >= grid.cols) return null;
  return { row, col };
}

function collectGridPath(frames, heap) {
  const locals = gridLocals(frames);
  const matrices = [];
  locals.forEach(({ name, value }) => {
    const grid = readNumericGrid(name, value, heap);
    if (grid) matrices.push({ name, ...grid });
  });
  if (!matrices.length) return null;

  const effort = matrices.find((matrix) => GRID_EFFORT_PATTERN.test(matrix.name)) || null;
  const weight = matrices.find((matrix) => GRID_WEIGHT_PATTERN.test(matrix.name)) || null;
  const frontierHit = findCoordinateFrontier(locals, heap, matrices, effort);
  const blockedByOtherHeap = !frontierHit && locals.some((local) => {
    if (!PATH_FRONTIER_NAMES.includes(local.name.toLowerCase()) || local.value?.kind !== "ref") return false;
    const object = heap[local.value.id];
    return object?.elements?.length && (object.type === "list" || object.type === "tuple" || object.type === "deque");
  });
  if (blockedByOtherHeap) return null;
  if (!frontierHit && !effort && !weight) return null;

  const anchor = frontierHit?.grid || effort || weight;
  const shown = effort && sameShape(effort, anchor) ? effort : anchor;
  const terrain = weight && weight !== shown && sameShape(weight, shown) ? weight : null;
  const frontier = frontierHit && sameShape(frontierHit.grid, shown) ? { name: frontierHit.name, ...frontierHit.parsed } : null;
  if (frontier?.entries && effort && sameShape(effort, shown)) markStaleEntries(frontier.entries, effort);

  return {
    shown,
    terrain,
    effortName: effort?.name || null,
    frontier,
    current: cellInGrid(locals, ["row", "r"], ["col", "c"], shown),
    neighbor: cellInGrid(locals, ["new_row", "nr"], ["new_col", "nc"], shown),
    currentEffort: readNumberLocal(locals, ["current_effort", "curr_effort"]),
    jump: readNumberLocal(locals, ["jump"]),
    newEffort: readNumberLocal(locals, ["new_effort", "new_cost", "new_dist"])
  };
}

function finiteRange(cells) {
  let min = Infinity;
  let max = -Infinity;
  let any = false;
  cells.flat().forEach((value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    any = true;
    if (n < min) min = n;
    if (n > max) max = n;
  });
  return any ? { min, max } : null;
}

function effortTone(value, range) {
  const n = Number(value);
  if (!range || !Number.isFinite(n)) return "";
  if (range.max === range.min) return "low";
  const t = (n - range.min) / (range.max - range.min);
  if (t <= 0.34) return "low";
  if (t <= 0.67) return "mid";
  return "high";
}

function heapMarks(frontier) {
  const marks = new Map();
  frontier?.entries?.forEach((entry, index) => {
    const key = `${entry.row},${entry.col}`;
    if (!marks.has(key)) marks.set(key, { entries: [], next: false });
    const mark = marks.get(key);
    mark.entries.push(entry);
    if (index === frontier.nextIndex) mark.next = true;
  });
  return marks;
}

function heapBadge(mark) {
  const costs = mark.entries.map((entry) => entry.cost).filter((cost) => cost != null);
  if (!costs.length) return mark.entries.length > 1 ? `×${mark.entries.length}` : "heap";
  const best = costs.reduce((left, right) => (Number(left) <= Number(right) ? left : right));
  const count = mark.entries.length > 1 ? ` ×${mark.entries.length}` : "";
  return `${formatPathCost(best)}${count}`;
}

function gridRoleLabel(role, scene) {
  if (role === "cost") return scene.effortName || "cost";
  if (role === "cell") return "(row, col)";
  if (role === "path") return "path";
  if (role === "extra") return "value";
  return role;
}

function gridShapeSentence(scene) {
  const roles = scene.frontier?.roles;
  if (!scene.frontier) return "No heap in memory yet.";
  if (!roles) return `${scene.frontier.name} is empty.`;
  const parts = roles.map((role) => gridRoleLabel(role, scene));
  return `${scene.frontier.name} tuples have ${roles.length} value${roles.length === 1 ? "" : "s"}: (${parts.join(", ")}).`;
}

function renderGridBoard(scene) {
  const { shown, terrain } = scene;
  const range = finiteRange(shown.cells);
  const marks = heapMarks(scene.frontier);
  const header = Array.from({ length: shown.cols }, (_, col) => `<div class="path-grid-index">${col}</div>`).join("");
  const body = shown.cells.map((row, r) => {
    const cells = row.map((raw, c) => {
      const mark = marks.get(`${r},${c}`);
      const classes = ["path-cell", effortTone(raw, range)];
      if (scene.current && scene.current.row === r && scene.current.col === c) classes.push("current");
      if (scene.neighbor && scene.neighbor.row === r && scene.neighbor.col === c) classes.push("checking");
      if (mark) {
        classes.push("queued");
        if (mark.next) classes.push("next");
        if (mark.entries.every((entry) => entry.stale)) classes.push("stale");
      }
      const weight = terrain
        ? `<span class="path-cell-weight" title="${escapeAttr(terrain.name)}">${escapeHtml(formatPathCost(terrain.cells[r][c]))}</span>`
        : "";
      const badge = mark ? `<span class="path-cell-badge">${escapeHtml(heapBadge(mark))}</span>` : "";
      const title = terrain
        ? `(${r}, ${c}) ${terrain.name} ${formatPathCost(terrain.cells[r][c])}, ${shown.name} ${formatPathCost(raw)}`
        : `(${r}, ${c}) ${shown.name} ${formatPathCost(raw)}`;
      return `<div class="${classes.filter(Boolean).join(" ")}" title="${escapeAttr(title)}">${badge}${weight}<span class="path-cell-value">${escapeHtml(formatPathCost(raw))}</span></div>`;
    }).join("");
    return `<div class="path-grid-index">${r}</div>${cells}`;
  }).join("");
  return `<div class="path-grid-wrap"><div class="path-grid" style="--cols:${shown.cols}"><div class="path-grid-index"></div>${header}${body}</div></div>`;
}

function renderGridPathLegend(scene) {
  const stale = scene.frontier?.entries?.some((entry) => entry.stale);
  const stacked = scene.terrain
    ? `<span class="tree-chip"><strong>${escapeHtml(scene.terrain.name)}</strong> above <strong>${escapeHtml(scene.shown.name)}</strong></span>`
    : "";
  tutorPathLegend.innerHTML = `
    <div class="tree-legend-row">
      <span class="tree-chip active"><strong>${escapeHtml(scene.shown.name)}</strong> ${scene.shown.rows}×${scene.shown.cols}</span>
      ${stacked}
    </div>
    <div class="tree-legend-row">
      <span class="tree-key"><span class="tree-swatch low"></span>Lower ${escapeHtml(scene.shown.name)}</span>
      <span class="tree-key"><span class="tree-swatch high"></span>Higher</span>
      <span class="tree-key"><span class="tree-swatch active"></span>Current cell</span>
      <span class="tree-key"><span class="tree-swatch checking"></span>Neighbor being checked</span>
      <span class="tree-key"><span class="tree-swatch heap"></span>In the heap, brighter is the next pop</span>
    </div>
    <p class="path-note">${escapeHtml(gridShapeSentence(scene))}${stale ? " Dimmed heap rows are already worse than the saved effort." : ""}</p>
  `;
}

function renderGridPathState(scene) {
  const chip = (text, extra = "") => `<span class="graph-search-chip${extra}">${escapeHtml(text)}</span>`;
  const current = scene.current
    ? chip(`(${scene.current.row}, ${scene.current.col})`, " current-cell")
      + (scene.currentEffort != null ? chip(`effort ${formatPathCost(scene.currentEffort)}`) : "")
    : `<span class="graph-search-empty">no cell popped yet</span>`;
  const checkingBits = [];
  if (scene.neighbor) checkingBits.push(chip(`(${scene.neighbor.row}, ${scene.neighbor.col})`, " checking-cell"));
  if (scene.jump != null) checkingBits.push(chip(`jump ${formatPathCost(scene.jump)}`));
  if (scene.newEffort != null) checkingBits.push(chip(`new ${formatPathCost(scene.newEffort)}`));
  const checking = checkingBits.length
    ? checkingBits.join("")
    : `<span class="graph-search-empty">none</span>`;

  let frontierBody = `<span class="graph-search-empty">none</span>`;
  if (scene.frontier) {
    if (!scene.frontier.entries.length) {
      frontierBody = `<span class="graph-search-empty">empty</span>`;
    } else {
      const width = scene.frontier.roles.length;
      const head = scene.frontier.roles.map((role) => `<span>${escapeHtml(gridRoleLabel(role, scene))}</span>`).join("");
      const rows = scene.frontier.entries.map((entry, index) => {
        const classes = [
          "path-tuple-row",
          index === scene.frontier.nextIndex ? "next" : "",
          entry.stale ? "stale" : ""
        ].filter(Boolean).join(" ");
        const parts = entry.slots.map((slot) => {
          const text = slot.role === "cost" ? formatPathCost(slot.text) : slot.text;
          return `<span class="path-tuple-part${slot.role === "cost" ? " cost" : ""}">${escapeHtml(text)}</span>`;
        }).join("");
        return `<div class="${classes}" style="--n:${width}">${parts}</div>`;
      }).join("");
      frontierBody = `<div class="path-frontier"><div class="path-tuple-head" style="--n:${width}">${head}</div>${rows}</div>`;
    }
  }

  const nextNote = scene.frontier?.nextIndex >= 0 ? " · next pop" : "";
  tutorPathState.hidden = false;
  tutorPathState.innerHTML = `
    <div class="graph-search-block">
      <div class="graph-search-label">Current cell</div>
      <div class="graph-search-chips">${current}</div>
    </div>
    <div class="graph-search-block">
      <div class="graph-search-label">Checking</div>
      <div class="graph-search-chips">${checking}</div>
    </div>
    <div class="graph-search-block">
      <div class="graph-search-label">${escapeHtml(scene.frontier?.name || "heap")}${nextNote}</div>
      ${frontierBody}
    </div>
  `;
}

function renderGridPath(scene) {
  if (pathZoomBar) pathZoomBar.hidden = true;
  renderGridPathLegend(scene);
  tutorPathCanvas.innerHTML = renderGridBoard(scene);
  renderGridPathState(scene);
}

function renderPathLegend(graphs, graph, state) {
  const picker = graphs.length > 1
    ? `<div class="tree-legend-row"><span class="traversal-label">Graph</span>${graphs.map((option) => `
        <button class="graph-source-button${option === graph ? " active" : ""}" type="button" data-graph-source="${escapeAttr(option.name)}">${escapeHtml(option.name)}</button>`).join("")}</div>`
    : "";
  tutorPathLegend.innerHTML = `
    ${picker}
    <div class="tree-legend-row">
      <span class="tree-chip active"><strong>${escapeHtml(graph.name)}</strong> path</span>
      <span class="tree-key"><span class="tree-swatch path"></span>${state.pathSource ? `From ${escapeHtml(state.pathSource)}` : "No path variable yet"}</span>
      ${state.dist ? `<span class="tree-key"><span class="tree-swatch cost"></span>${escapeHtml(state.dist.name)} on each node</span>` : ""}
    </div>
    <p class="path-note">Follows a path list, a parent or prev map, a dist / cost / effort dict, and a heap or queue of candidate paths.</p>
  `;
}

function renderTutorPath(frames, heap, labels) {
  const gridScene = collectGridPath(frames, heap);
  if (gridScene) {
    renderGridPath(gridScene);
    return;
  }

  const tab = getActiveTab();
  const graphs = findGraphs(frames, heap, labels);
  if (!graphs.length) {
    tutorPathLegend.innerHTML = "";
    tutorPathState.hidden = true;
    if (pathZoomBar) pathZoomBar.hidden = true;
    tutorPathCanvas.innerHTML = `<p class="tutor-empty">No route in memory at this step. The Path tab reads a graph and the variables that manage a route, or a height / effort grid plus a heap. Tuple length decides the heap: two numbers are a cell, a nested pair is a cell, and three numbers are a cost plus a row and column.</p>`;
    return;
  }

  const graph = graphs.find((option) => option.name === tab?.graphSource) || graphs[0];
  const pointers = collectGraphPointers(frames, graph, heap);
  const marks = collectGraphMarks(frames, graph, heap);
  const state = collectPathState(frames, graph, heap);
  renderPathLegend(graphs, graph, state);
  tutorPathCanvas.innerHTML = renderGraphSvg(graph, pointers, marks, null, {
    pathNodes: new Set(state.path),
    pathEdges: managedPathEdges(graph, state.path),
    dist: state.dist?.map || null,
    tip: state.path.at(-1) || null
  }, "path");
  applyGraphZoom(tab);
  renderPathState(state, graph);
}

// ---------------------------------------------------------------------------
// Disjoint Set Union
// Rank and size are counted from the parent links. The code does not have
// to keep a rank array or a size array for these numbers to update.
// ---------------------------------------------------------------------------

const DSU_PARENT_PATTERN = /^(parent|parents|par|parent_of|uf|dsu|disjoint|pi)$/i;
const DSU_POINTER_PATTERN = /node|root|city|curr|current|^[abuvxyij]$/i;
const DSU_HERE_PRIORITY = ["node", "current", "curr", "cur", "city", "i", "x", "j", "root_a", "a", "u", "root_b", "b", "v", "y"];
const DSU_COLORS = ["#78dce8", "#c8a8ff", "#ffd866", "#72e0aa", "#ff9e64", "#ff7ab2", "#9ba3ff", "#f8cc5c"];
const DSU_COL_W = 46;
const DSU_ROW_H = 62;
const DSU_NODE_R = 15;

function isDsuParentName(name) {
  const leaf = String(name).split(".").pop();
  return DSU_PARENT_PATTERN.test(leaf);
}

function primitiveToken(encoded) {
  if (encoded?.kind !== "primitive") return null;
  if (encoded.type === "int") {
    const value = Number(encoded.value);
    if (!Number.isInteger(value)) return null;
    return { key: String(value), label: String(value) };
  }
  if (encoded.type === "str") {
    const label = stripQuotes(encoded.value);
    return { key: `s:${label}`, label };
  }
  return null;
}

function compareDsuLabels(a, b) {
  const aNum = Number(a);
  const bNum = Number(b);
  const aIsInt = Number.isInteger(aNum) && String(aNum) === a;
  const bIsInt = Number.isInteger(bNum) && String(bNum) === b;
  if (aIsInt && bIsInt) return aNum - bNum;
  return String(a).localeCompare(String(b));
}

function parentLinksFromList(object) {
  if (!object?.elements?.length || (object.type !== "list" && object.type !== "tuple")) return null;
  const count = object.elements.length;
  const pointers = [];
  for (let index = 0; index < count; index += 1) {
    const token = primitiveToken(object.elements[index]);
    if (!token || token.key.startsWith("s:")) return null;
    const raw = Number(token.label);
    // A negative entry is the union-by-size root marker. The stored
    // magnitude is ignored; size is counted from the links instead.
    const parent = raw < 0 ? index : raw;
    if (parent < 0 || parent >= count) return null;
    pointers.push(String(parent));
  }
  return pointers.map((parentKey, index) => ({
    key: String(index),
    label: String(index),
    parentKey
  }));
}

function parentLinksFromDict(object) {
  if (!object?.entries?.length) return null;
  const nodes = new Map();
  const edges = [];
  for (const [keyEncoded, valueEncoded] of object.entries) {
    const key = primitiveToken(keyEncoded);
    const value = primitiveToken(valueEncoded);
    if (!key || !value) return null;
    nodes.set(key.key, key);
    edges.push([key.key, value]);
  }
  edges.forEach(([, value]) => {
    if (!nodes.has(value.key)) nodes.set(value.key, value);
  });
  return [...nodes.values()].map((token) => {
    const edge = edges.find(([key]) => key === token.key);
    const parentKey = edge && nodes.has(edge[1].key) ? edge[1].key : token.key;
    return { key: token.key, label: token.label, parentKey };
  });
}

function describeParentLinks(links) {
  const byKey = new Map(links.map((link) => [link.key, link]));
  const rootOf = (start) => {
    const seen = new Set();
    let cursor = start;
    while (!seen.has(cursor)) {
      seen.add(cursor);
      const node = byKey.get(cursor);
      if (!node) return null;
      if (node.parentKey === cursor) return cursor;
      cursor = node.parentKey;
    }
    return null;
  };

  const roots = new Map();
  for (const link of links) {
    const root = rootOf(link.key);
    if (!root) return null;
    roots.set(link.key, root);
  }

  const children = new Map();
  links.forEach((link) => {
    if (link.parentKey === link.key) return;
    if (!children.has(link.parentKey)) children.set(link.parentKey, []);
    children.get(link.parentKey).push(link.key);
  });
  children.forEach((kids) => kids.sort((a, b) => compareDsuLabels(byKey.get(a).label, byKey.get(b).label)));

  const heightMemo = new Map();
  const heightOf = (key) => {
    if (heightMemo.has(key)) return heightMemo.get(key);
    const kids = children.get(key) || [];
    const height = kids.length ? 1 + Math.max(...kids.map(heightOf)) : 0;
    heightMemo.set(key, height);
    return height;
  };

  const members = new Map();
  links.forEach((link) => {
    const root = roots.get(link.key);
    if (!members.has(root)) members.set(root, []);
    members.get(root).push(link);
  });

  const groups = [...members.entries()].map(([rootKey, groupLinks]) => {
    const ordered = groupLinks.slice().sort((a, b) => compareDsuLabels(a.label, b.label));
    return {
      rootKey,
      rootLabel: byKey.get(rootKey).label,
      rank: heightOf(rootKey),
      size: ordered.length,
      memberKeys: ordered.map((link) => link.key),
      memberLabels: ordered.map((link) => link.label)
    };
  });

  const nodes = links.map((link) => ({
    ...link,
    rootKey: roots.get(link.key),
    rootLabel: byKey.get(roots.get(link.key)).label,
    isRoot: link.parentKey === link.key
  }));

  return { nodes, groups, children, byKey };
}

function findDsuSets(frames, heap) {
  const found = [];
  const seen = new Set();
  const consider = (bindingName, encoded, sourceKey) => {
    if (!isDsuParentName(bindingName) || encoded?.kind !== "ref" || seen.has(encoded.id)) return;
    const object = heap?.[encoded.id];
    const links = parentLinksFromList(object) || parentLinksFromDict(object);
    if (!links) return;
    const described = describeParentLinks(links);
    if (!described) return;
    seen.add(encoded.id);
    found.push({ key: sourceKey, name: sourceKey, ...described });
  };

  (frames || []).forEach((frame) => {
    Object.entries(frame.locals || {}).forEach(([name, value]) => {
      const sourceKey = frame.name === "Global frame" ? name : `${frame.name.replace(/\(\)$/, "")}.${name}`;
      consider(name, value, sourceKey);
    });
  });
  Object.values(heap || {}).forEach((object) => {
    if (!object?.attrs) return;
    Object.entries(object.attrs).forEach(([name, value]) => {
      consider(name, value, `${object.type}.${name}`);
    });
  });
  return found;
}

function dsuGroupSignature(group) {
  return group.memberKeys.slice().sort().join("|");
}

function markDsuChanges(current, previous) {
  const previousParent = new Map((previous?.nodes || []).map((node) => [node.key, node.parentKey]));
  const previousGroups = new Set((previous?.groups || []).map(dsuGroupSignature));
  const hasPrevious = Boolean(previous);
  current.nodes.forEach((node) => {
    node.parentChanged = hasPrevious && previousParent.get(node.key) !== node.parentKey;
  });
  current.groups.forEach((group) => {
    group.changed = hasPrevious && !previousGroups.has(dsuGroupSignature(group));
  });
}

function collectDsuPointers(frames, nodes) {
  const keys = new Set(nodes.map((node) => node.key));
  const pointers = new Map();
  const frame = frames?.at(-1);
  if (!frame) return pointers;
  Object.entries(frame.locals || {}).forEach(([name, value]) => {
    if (!DSU_POINTER_PATTERN.test(name)) return;
    const token = primitiveToken(value);
    if (!token || !keys.has(token.key)) return;
    if (!pointers.has(token.key)) pointers.set(token.key, []);
    pointers.get(token.key).push(name);
  });
  return pointers;
}

function currentDsuNode(pointers) {
  let best = null;
  let bestRank = Infinity;
  pointers.forEach((names, key) => {
    names.forEach((name) => {
      const rank = DSU_HERE_PRIORITY.indexOf(name);
      const score = rank === -1 ? DSU_HERE_PRIORITY.length : rank;
      if (score < bestRank) {
        bestRank = score;
        best = { key, name };
      }
    });
  });
  return best;
}

function layoutDsuForest(described) {
  const positions = new Map();
  let cursor = 0;
  let maxDepth = 0;
  const spans = [];

  const place = (key, left, depth) => {
    const kids = described.children.get(key) || [];
    if (!kids.length) {
      positions.set(key, { x: left + 0.5, depth });
      maxDepth = Math.max(maxDepth, depth);
      return 1;
    }
    let childLeft = left;
    kids.forEach((child) => {
      childLeft += place(child, childLeft, depth + 1);
    });
    const first = positions.get(kids[0]);
    const last = positions.get(kids[kids.length - 1]);
    positions.set(key, { x: (first.x + last.x) / 2, depth });
    maxDepth = Math.max(maxDepth, depth);
    return childLeft - left;
  };

  const ordered = described.groups.slice().sort((a, b) => compareDsuLabels(a.rootLabel, b.rootLabel));
  ordered.forEach((group) => {
    const width = place(group.rootKey, cursor, 0);
    const members = group.memberKeys.map((key) => positions.get(key).x);
    spans.push({
      group,
      center: (Math.min(...members) + Math.max(...members)) / 2
    });
    cursor += width + 0.45;
  });

  return { positions, maxDepth, spans, widthUnits: Math.max(cursor - 0.45, 1) };
}

function renderDsuSvg(described, pointers, here) {
  const layout = layoutDsuForest(described);
  const pad = 28;
  const width = Math.max(pad * 2 + layout.widthUnits * DSU_COL_W, 180);
  const height = pad + layout.maxDepth * DSU_ROW_H + DSU_NODE_R + 36;
  const colorOf = new Map(described.groups.map((group, index) => [group.rootKey, DSU_COLORS[index % DSU_COLORS.length]]));
  const point = (key) => {
    const pos = layout.positions.get(key);
    return {
      x: pad + pos.x * DSU_COL_W,
      y: pad + pos.depth * DSU_ROW_H
    };
  };

  const edges = described.nodes.filter((node) => !node.isRoot).map((node) => {
    const from = point(node.key);
    const to = point(node.parentKey);
    const changed = node.parentChanged ? " changed" : "";
    return `<line class="dsu-edge${changed}" x1="${from.x}" y1="${from.y - DSU_NODE_R}" x2="${to.x}" y2="${to.y + DSU_NODE_R}" />`;
  }).join("");

  const parentKey = here ? described.byKey.get(here.key)?.parentKey : null;
  const nodes = described.nodes.map((node) => {
    const { x, y } = point(node.key);
    const names = pointers.get(node.key) || [];
    const isHere = here && node.key === here.key;
    const isParentNode = parentKey && node.key === parentKey && !isHere;
    const classes = [
      "tree-node",
      node.isRoot ? "dsu-root" : "",
      isHere ? "dsu-focus" : "",
      isParentNode ? "dsu-parent-node" : ""
    ].filter(Boolean).join(" ");
    const label = node.label.length > 6 ? `${node.label.slice(0, 5)}…` : node.label;
    const pointer = names.length
      ? `<text class="dsu-pointer" x="${x}" y="${y + DSU_NODE_R + 12}">${escapeHtml(names.join(", "))}</text>`
      : "";
    return `
      <g class="${classes}" style="--dsu-color:${colorOf.get(node.rootKey)}">
        <title>${escapeHtml(node.label)} → ${escapeHtml(described.byKey.get(node.parentKey).label)}</title>
        <circle cx="${x}" cy="${y}" r="${DSU_NODE_R}" />
        <text x="${x}" y="${y + 4}">${escapeHtml(label)}</text>
        ${pointer}
      </g>`;
  }).join("");

  return `
    <svg class="dsu-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Disjoint set forest">
      ${edges}
      ${nodes}
    </svg>`;
}

function renderDsuCards(groups, stat) {
  const ordered = groups.slice().sort((a, b) => {
    const diff = b[stat] - a[stat];
    if (diff) return diff;
    const other = stat === "rank" ? "size" : "rank";
    return (b[other] - a[other]) || compareDsuLabels(a.rootLabel, b.rootLabel);
  });
  if (!ordered.length) return `<p class="tutor-empty">No groups yet.</p>`;
  return ordered.map((group) => {
    const other = stat === "rank" ? "size" : "rank";
    return `
      <article class="dsu-card${group.changed ? " changed" : ""}" style="border-left-color:${DSU_COLORS[groups.indexOf(group) % DSU_COLORS.length]}">
        <div class="dsu-card-stat"><span>${stat}</span><strong>${group[stat]}</strong></div>
        <div>
          <div class="dsu-card-root">root ${escapeHtml(group.rootLabel)}</div>
          <div class="dsu-card-meta">${other} ${group[other]}</div>
          <div class="dsu-card-members">{${escapeHtml(group.memberLabels.join(", "))}}</div>
        </div>
      </article>`;
  }).join("");
}

function renderDsuParentBoard(described, here) {
  const nodes = described.nodes.slice().sort((a, b) => compareDsuLabels(a.label, b.label));
  const hereNode = here ? described.byKey.get(here.key) : null;
  const parentNode = hereNode ? described.byKey.get(hereNode.parentKey) : null;
  const rows = nodes.map((node) => {
    const isHere = Boolean(hereNode && node.key === hereNode.key);
    const isParent = Boolean(parentNode && node.key === parentNode.key);
    const classes = ["dsu-slot", isHere ? "here" : "", isParent && !isHere ? "parent" : "", isHere && isParent ? "parent" : ""].filter(Boolean).join(" ");
    const tags = [];
    if (isHere) tags.push(here.name);
    if (isParent && isHere) tags.push("root");
    else if (isParent) tags.push("parent");
    return `
      <div class="${classes}">
        <span class="dsu-slot-index">${escapeHtml(node.label)}</span>
        <span class="dsu-slot-value">${escapeHtml(described.byKey.get(node.parentKey).label)}</span>
        <span class="dsu-slot-tag">${escapeHtml(tags.join(" · "))}</span>
      </div>`;
  }).join("");
  const summary = hereNode
    ? `on ${escapeHtml(here.name)} = ${escapeHtml(hereNode.label)}, parent value ${escapeHtml(parentNode.label)}`
    : "Step into find, or onto a node index, to mark the current slot.";
  tutorDsuParents.innerHTML = `
    <div class="dsu-organize-label">Parent list</div>
    <p class="dsu-parent-summary">${summary}</p>
    <div class="dsu-slot-head"><span>i</span><span>parent[i]</span><span></span></div>
    ${rows}`;
  const currentRow = tutorDsuParents.querySelector(".dsu-slot.here");
  if (currentRow) currentRow.scrollIntoView({ block: "nearest" });
}

function renderDsuDetail(described) {
  const parents = described.nodes.slice().sort((a, b) => compareDsuLabels(a.label, b.label)).map((node) => `
    <div class="dsu-parent-cell${node.parentChanged ? " changed" : ""}">
      <span class="dsu-parent-node">${escapeHtml(node.label)}</span><span class="dsu-parent-arrow">→</span><span class="dsu-parent-target">${escapeHtml(described.byKey.get(node.parentKey).label)}</span>
      <span class="dsu-parent-root">root ${escapeHtml(node.rootLabel)}</span>
    </div>`).join("");
  const groups = described.groups.slice().sort((a, b) => compareDsuLabels(a.rootLabel, b.rootLabel)).map((group) => `
    <div class="dsu-group${group.changed ? " changed" : ""}">
      <span class="dsu-group-root">root ${escapeHtml(group.rootLabel)}</span>
      <span class="dsu-group-members">{${escapeHtml(group.memberLabels.join(", "))}}</span>
    </div>`).join("");
  tutorDsuDetail.innerHTML = `
    <div>
      <div class="dsu-detail-label">Parents</div>
      <div class="dsu-parent-row">${parents}</div>
    </div>
    <div>
      <div class="dsu-detail-label">Groups</div>
      <div class="dsu-group-row">${groups}</div>
    </div>`;
}

function renderTutorDsu(frames, heap) {
  const tab = getActiveTab();
  const sets = findDsuSets(frames, heap);
  if (!sets.length) {
    tutorDsuLegend.innerHTML = `<p class="dsu-note">No disjoint set in memory at this step. Use a list or dict named <code>parent</code>, <code>parents</code>, <code>par</code>, or <code>uf</code>. Rank and size are counted from those links.</p>`;
    tutorDsuCanvas.innerHTML = `<p class="tutor-empty">Parents and groups show up here once a parent array is in memory. A fresh <code>parent = list(range(n))</code> is one group per node, each of rank 0 and size 1.</p>`;
    tutorDsuParents.innerHTML = `<div class="dsu-organize-label">Parent list</div><p class="tutor-empty">The parent array shows up here, beside the tree.</p>`;
    tutorDsuByRank.innerHTML = `<div class="dsu-organize-label">By rank</div><p class="tutor-empty">Filled from the parent links. The code does not set this.</p>`;
    tutorDsuBySize.innerHTML = `<div class="dsu-organize-label">By size</div><p class="tutor-empty">Filled from the parent links. The code does not set this.</p>`;
    tutorDsuDetail.innerHTML = "";
    return;
  }

  const described = sets.find((set) => set.key === tab?.dsuSource) || sets[0];
  if (tab) tab.dsuSource = described.key;
  const previousStep = tab?.tutorSteps?.[tab.tutorStepIndex - 1];
  const previous = previousStep
    ? findDsuSets(previousStep.frames, previousStep.heap).find((set) => set.key === described.key)
    : null;
  markDsuChanges(described, previous);

  const picker = sets.length > 1
    ? `<div class="tree-legend-row"><span class="traversal-label">Parent</span>${sets.map((set) => `
        <button class="graph-source-button${set.key === described.key ? " active" : ""}" type="button" data-dsu-source="${escapeAttr(set.key)}">${escapeHtml(set.name)}</button>`).join("")}</div>`
    : "";
  tutorDsuLegend.innerHTML = `
    ${picker}
    <div class="tree-legend-row">
      <span class="tree-chip active"><strong>${escapeHtml(described.name)}</strong></span>
      <span class="tree-key">${described.groups.length} group${described.groups.length === 1 ? "" : "s"}</span>
      <span class="tree-key"><span class="tree-swatch active"></span>Node we're on</span>
      <span class="tree-key"><span class="tree-swatch parent"></span>Its parent</span>
      <span class="tree-key"><span class="tree-swatch changed-link"></span>Link just changed</span>
    </div>
    <p class="dsu-note">Rank is the height of each tree. Size is how many nodes share a root. Both update from the parent links, even when the code never stores rank or size.</p>`;

  const pointers = collectDsuPointers(frames, described.nodes);
  const here = currentDsuNode(pointers);
  tutorDsuCanvas.innerHTML = renderDsuSvg(described, pointers, here);
  renderDsuParentBoard(described, here);
  tutorDsuByRank.innerHTML = `<div class="dsu-organize-label">By rank</div>${renderDsuCards(described.groups, "rank")}`;
  tutorDsuBySize.innerHTML = `<div class="dsu-organize-label">By size</div>${renderDsuCards(described.groups, "size")}`;
  renderDsuDetail(described);
}

// ---------------------------------------------------------------------------
// Dynamic programming coin table
// fewest[i] is the answer for making i cents. first_coin[i] is the coin
// that produced that answer. Later amounts read those cells instead of
// solving the leftover again.
// ---------------------------------------------------------------------------

function readScalarInt(encoded) {
  const token = primitiveToken(encoded);
  if (!token || token.key.startsWith("s:")) return null;
  return Number(token.label);
}

function readDpList(object) {
  if (!object?.elements || (object.type !== "list" && object.type !== "tuple")) return null;
  const values = [];
  for (const element of object.elements) {
    if (element?.kind === "primitive" && element.type === "NoneType") {
      values.push(null);
      continue;
    }
    const value = readScalarInt(element);
    if (value == null) return null;
    values.push(value);
  }
  return values;
}

function findInnermostList(frames, heap, pattern, allowEmpty = false) {
  let found = null;
  (frames || []).forEach((frame) => {
    Object.entries(frame.locals || {}).forEach(([name, encoded]) => {
      if (!pattern.test(name) || encoded?.kind !== "ref") return;
      const values = readDpList(heap?.[encoded.id]);
      if (!values || (!allowEmpty && !values.length)) return;
      found = { name, values };
    });
  });
  return found;
}

function findInnermostInt(frames, names) {
  const wanted = new Set(names);
  let found = null;
  (frames || []).forEach((frame) => {
    Object.entries(frame.locals || {}).forEach(([name, encoded]) => {
      if (!wanted.has(name)) return;
      const value = readScalarInt(encoded);
      if (value == null) return;
      found = value;
    });
  });
  return found;
}

function collectDpState(frames, heap) {
  const count = findInnermostList(frames, heap, /^(fewest|min_coins|coin_dp)$/i)
    || findInnermostList(frames, heap, /^dp$/i);
  if (!count) return null;
  const choice = findInnermostList(frames, heap, /^(first_coin|coin_choice|choice)$/i);
  const coins = findInnermostList(frames, heap, /^(coins|denoms|denominations)$/i);
  const chosen = findInnermostList(frames, heap, /^(chosen|dp_coins|taken)$/i, true);
  const amountIndex = findInnermostInt(frames, ["a"]);
  const coin = findInnermostInt(frames, ["coin"]);
  const left = findInnermostInt(frames, ["left"]);
  const mode = left != null ? "rebuild" : amountIndex != null ? "fill" : "done";
  const future = mode === "fill" && coin != null && amountIndex != null && coin <= amountIndex && amountIndex - coin >= 0
    ? amountIndex - coin
    : null;
  return { count, choice, coins, chosen, amountIndex, coin, left, mode, future };
}

function previousDpValues(name) {
  const tab = getActiveTab();
  const step = tab?.tutorSteps?.[tab.tutorStepIndex - 1];
  if (!step || !name) return null;
  return findInnermostList(step.frames, step.heap, new RegExp(`^${name}$`))?.values || null;
}

function dpColumnClass(index, state) {
  if (state.mode === "rebuild" && index === state.left) return "here";
  if (state.mode === "fill" && index === state.amountIndex) return "here";
  if (state.mode === "fill" && index === state.future) return "future";
  return "";
}

function renderDpGrid(state) {
  const count = state.count.values;
  const choice = state.choice?.values || [];
  const previousCount = previousDpValues(state.count.name);
  const previousChoice = state.choice ? previousDpValues(state.choice.name) : null;
  const indexes = count.map((_, index) => {
    const mark = dpColumnClass(index, state);
    return `<div class="dp-index${mark ? ` ${mark}` : ""}">${index}</div>`;
  }).join("");
  const countCells = count.map((value, index) => {
    const mark = dpColumnClass(index, state);
    const unset = value >= count.length;
    const changed = previousCount && previousCount[index] !== value;
    const classes = ["dp-cell", mark, unset ? "unset" : "", changed ? "changed" : ""].filter(Boolean).join(" ");
    return `<div class="${classes}"><span>${value}</span></div>`;
  }).join("");
  const choiceCells = state.choice ? count.map((_, index) => {
    const value = index < choice.length ? choice[index] : null;
    const mark = dpColumnClass(index, state);
    const changed = previousChoice && previousChoice[index] !== value;
    const classes = ["dp-cell", mark, value == null ? "unset" : "", changed ? "changed" : ""].filter(Boolean).join(" ");
    return `<div class="${classes}"><span>${value == null ? "—" : value}</span></div>`;
  }).join("") : "";
  const choiceRow = state.choice
    ? `<div class="dp-row-label">${escapeHtml(state.choice.name)}</div>${choiceCells}`
    : "";
  return `
    <div class="dp-grid" style="--n:${count.length}">
      <div class="dp-corner"></div>
      ${indexes}
      <div class="dp-row-label">${escapeHtml(state.count.name)}</div>
      ${countCells}
      ${choiceRow}
    </div>`;
}

function renderDpChoice(state) {
  if (state.mode !== "fill" || state.amountIndex == null) {
    tutorDpChoice.innerHTML = `<div class="dsu-organize-label">This amount</div><p class="tutor-empty">Coin trials show up while an amount is being solved.</p>`;
    return;
  }
  const coins = state.coins?.values || [];
  const bestCoin = state.choice?.values?.[state.amountIndex];
  const bestCount = state.count.values[state.amountIndex];
  const solved = bestCount != null && bestCount < state.count.values.length;
  const summary = solved
    ? `${state.amountIndex}¢ best so far: ${bestCount} coin${bestCount === 1 ? "" : "s"}${bestCoin == null ? "" : `, taking ${bestCoin} first`}.`
    : `${state.amountIndex}¢ has no coin kept yet.`;
  const trials = coins.map((coin) => {
    const current = coin === state.coin;
    const best = bestCoin === coin && solved;
    if (coin > state.amountIndex) {
      return `<div class="dp-trial${current ? " current" : ""}"><span>take ${coin}</span><span>too big</span></div>`;
    }
    const leftover = state.count.values[state.amountIndex - coin];
    const total = 1 + leftover;
    return `<div class="dp-trial${current ? " current" : ""}${best ? " best" : ""}"><span>take ${coin}</span><span>1 + ${escapeHtml(state.count.name)}[${state.amountIndex - coin}] = ${total}</span></div>`;
  }).join("");
  tutorDpChoice.innerHTML = `
    <div class="dsu-organize-label">This amount</div>
    <p class="dp-summary">${escapeHtml(summary)}</p>
    ${trials || `<p class="tutor-empty">No list named coins is in this frame.</p>`}`;
}

function renderDpRebuild(state) {
  const taken = state.chosen?.values || [];
  const chips = taken.length
    ? taken.map((coin) => `<span class="dp-chip">${escapeHtml(String(coin))}</span>`).join("")
    : `<span class="queue-empty">none yet</span>`;
  let walk = "After the table is full, start from the amount still owed. Read first_coin there, record that coin, then repeat on what is left.";
  if (state.mode === "rebuild" && state.choice && state.left != null && state.left >= 0 && state.left < state.choice.values.length) {
    const take = state.choice.values[state.left];
    walk = take == null
      ? `Owe ${state.left}¢. ${state.choice.name}[${state.left}] is not set.`
      : `Owe ${state.left}¢. ${state.choice.name}[${state.left}] is ${take}, so take ${take} and owe ${state.left - take}¢ next.`;
  } else if (state.mode === "done" && taken.length) {
    walk = `Collected ${taken.join(" + ")}.`;
  }
  const label = state.chosen ? state.chosen.name : "chosen";
  tutorDpRebuild.innerHTML = `
    <div>
      <div class="dsu-detail-label">${escapeHtml(label)}</div>
      <div class="dp-chip-row">${chips}</div>
    </div>
    <p class="dsu-note">${escapeHtml(walk)}</p>`;
}

function renderTutorDp(frames, heap) {
  const state = collectDpState(frames, heap);
  if (!state) {
    tutorDpLegend.innerHTML = `<p class="dsu-note">No coin table in memory at this step. The DP tab reads a list named <code>fewest</code> or <code>dp</code>, and a choice list named <code>first_coin</code>.</p>`;
    tutorDpTables.innerHTML = `<p class="tutor-empty">Step into the function that fills the table. Column i is the smaller problem “make i cents.”</p>`;
    tutorDpChoice.innerHTML = "";
    tutorDpRebuild.innerHTML = "";
    return;
  }

  const choiceName = state.choice ? state.choice.name : "first_coin";
  tutorDpLegend.innerHTML = `
    <div class="tree-legend-row">
      <span class="tree-chip active"><strong>${escapeHtml(state.count.name)}</strong></span>
      ${state.choice ? `<span class="tree-chip"><strong>${escapeHtml(state.choice.name)}</strong></span>` : `<span class="tree-chip none">no ${escapeHtml(choiceName)}</span>`}
      <span class="tree-key"><span class="tree-swatch active"></span>${state.mode === "rebuild" ? "Amount still owed" : "Amount being solved"}</span>
      <span class="tree-key"><span class="tree-swatch parent"></span>Leftover already solved</span>
      <span class="tree-key"><span class="tree-swatch changed-link"></span>Just written</span>
    </div>
    <p class="dsu-note">Each column is its own problem, “make this many cents.” ${escapeHtml(state.count.name)} stores how many coins that takes. ${escapeHtml(choiceName)} stores the coin taken first. A larger amount reads the leftover’s column instead of solving it again, then the coin list is the chain of those first coins.</p>`;
  tutorDpTables.innerHTML = renderDpGrid(state);
  renderDpChoice(state);
  renderDpRebuild(state);
}

const TUTOR_VIEWS = ["memory", "tree", "graph", "path", "dsu", "dp"];

function applyTutorView(tab) {
  const view = TUTOR_VIEWS.includes(tab?.tutorView) ? tab.tutorView : "memory";
  tutorMemoryLayout.hidden = view !== "memory";
  tutorTreeView.hidden = view !== "tree";
  tutorGraphView.hidden = view !== "graph";
  tutorPathView.hidden = view !== "path";
  tutorDsuView.hidden = view !== "dsu";
  tutorDpView.hidden = view !== "dp";
  [[tutorMemoryViewButton, "memory"], [tutorTreeViewButton, "tree"], [tutorGraphViewButton, "graph"], [tutorPathViewButton, "path"], [tutorDsuViewButton, "dsu"], [tutorDpViewButton, "dp"]].forEach(([button, option]) => {
    button.classList.toggle("active", view === option);
    button.setAttribute("aria-selected", String(view === option));
  });
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
    tutorMethods: [],
    tutorView: "memory",
    traversalMode: "queue",
    graphRepr: null,
    graphSource: null,
    graphSearch: "bfs",
    graphZoom: GRAPH_ZOOM_DEFAULT,
    dsuSource: null,
    focusedVar: null
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
  tab.tutorMethods = [];
  tab.focusedVar = null;
  if (clearConsole) {
    tab.consoleOutput = "Run or Visualize to see output...";
  }
  syncTabToUI(tab);
}

// ---------------------------------------------------------------------------
// Stepper Controls
// ---------------------------------------------------------------------------

function stepFunctionName(step) {
  if (!step) return null;
  if (step.function) return step.function;
  const frames = step.frames || [];
  if (!frames.length) return null;
  const label = frames[frames.length - 1].name;
  if (!label || label === "Global frame" || !label.endsWith("()")) return null;
  return label.slice(0, -2);
}

function isMethodEntry(steps, index, methodName) {
  const step = steps[index];
  if (stepFunctionName(step) !== methodName) return false;
  if (index === 0) return true;
  const prev = steps[index - 1];
  const prevName = stepFunctionName(prev);
  const prevDepth = (prev.frames || []).length;
  const depth = (step.frames || []).length;
  return prevName !== methodName || depth > prevDepth;
}

function findNextMethodEntryIndex(tab, methodName) {
  if (!tab || !methodName || !tab.tutorSteps?.length) return -1;
  for (let index = tab.tutorStepIndex + 1; index < tab.tutorSteps.length; index++) {
    if (isMethodEntry(tab.tutorSteps, index, methodName)) return index;
  }
  return -1;
}

function populateMethodSelect(tab) {
  const methods = tab?.tutorMethods || [];
  const previous = tutorMethodSelect.value;
  if (!methods.length) {
    tutorMethodJump.hidden = true;
    tutorMethodSelect.innerHTML = "";
    return;
  }
  tutorMethodJump.hidden = false;
  tutorMethodSelect.innerHTML = methods
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}()</option>`)
    .join("");
  if (methods.includes(previous)) {
    tutorMethodSelect.value = previous;
  }
}

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

  populateMethodSelect(tab);
  const nextMethod = findNextMethodEntryIndex(tab, tutorMethodSelect.value);
  tutorSkipMethod.disabled = nextMethod < 0;
  tutorSkipMethod.dataset.target = String(nextMethod);
}

function renderTutorMemory(frames, heap, labels, names) {
  const tab = getActiveTab();
  const focusing = Boolean(tab?.focusedVar);
  tutorMemoryLayout.classList.toggle("is-focused", focusing);
  tutorVarFocus.hidden = !focusing;
  if (focusing) {
    renderFocusedVar(tab.focusedVar, frames, heap, labels);
    return;
  }
  renderTutorFrames(frames, heap, labels, names);
  renderTutorHeap(heap, labels);
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
  } else if (tab.tutorView === "graph") {
    renderTutorGraph(step.frames, step.heap, labels);
  } else if (tab.tutorView === "path") {
    renderTutorPath(step.frames, step.heap, labels);
  } else if (tab.tutorView === "dsu") {
    renderTutorDsu(step.frames, step.heap);
  } else if (tab.tutorView === "dp") {
    renderTutorDp(step.frames, step.heap);
  } else {
    renderTutorMemory(step.frames, step.heap, labels, names);
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
    tab.tutorMethods = data.methods || [];
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

tutorMethodSelect.addEventListener("change", () => {
  const tab = getActiveTab();
  if (tab) updateTutorControls(tab);
});

tutorSkipMethod.addEventListener("click", () => {
  const tab = getActiveTab();
  const target = Number(tutorSkipMethod.dataset.target);
  if (!tab || target < 0) return;
  showTutorStep(target);
  const name = tutorMethodSelect.value;
  if (name) {
    tutorStatus.textContent = `Skipped to ${name}().`;
  }
});

tutorSlider.addEventListener("input", () => {
  showTutorStep(Number(tutorSlider.value));
});

tutorMemoryViewButton.addEventListener("click", () => setTutorView("memory"));
tutorTreeViewButton.addEventListener("click", () => setTutorView("tree"));
tutorGraphViewButton.addEventListener("click", () => setTutorView("graph"));
tutorPathViewButton.addEventListener("click", () => setTutorView("path"));
tutorDsuViewButton.addEventListener("click", () => setTutorView("dsu"));
tutorDpViewButton.addEventListener("click", () => setTutorView("dp"));

function typingInVisibleField(target) {
  if (!target || target === document.body || target === document.documentElement) return false;
  const tag = target.tagName;
  if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT" && !target.isContentEditable) return false;
  if (target.hidden || target.closest("[hidden]")) return false;
  if (target.id === "notesText" && scratchEditor.classList.contains("tracing")) return false;
  return true;
}

document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key !== "a" && key !== "d") return;
  const tab = getActiveTab();
  if (!tab?.tutorActive || typingInVisibleField(event.target)) return;
  const button = key === "a" ? tutorPrev : tutorNext;
  if (button.disabled) return;
  event.preventDefault();
  showTutorStep(tab.tutorStepIndex + (key === "d" ? 1 : -1));
});

tutorMemoryLayout.addEventListener("click", (event) => {
  const tab = getActiveTab();
  if (!tab) return;
  const component = event.target.closest("[data-focus-part]");
  const frameVar = event.target.closest("[data-focus-frame]");
  const heapObject = event.target.closest("[data-focus-id]");
  if (component) {
    tab.focusedVar = {
      kind: "component",
      parentId: component.dataset.focusParent,
      part: component.dataset.focusPart,
      index: component.dataset.focusIndex,
      label: component.dataset.focusLabel
    };
  } else if (frameVar) {
    tab.focusedVar = {
      kind: "local",
      frameIndex: Number(frameVar.dataset.focusFrame),
      name: frameVar.dataset.focusName
    };
  } else if (heapObject) {
    tab.focusedVar = {
      kind: "heap",
      id: heapObject.dataset.focusId,
      label: heapObject.dataset.focusLabel
    };
  } else {
    return;
  }
  if (tab.tutorActive) showTutorStep(tab.tutorStepIndex);
});

tutorVarFocusClose.addEventListener("click", () => {
  const tab = getActiveTab();
  if (!tab) return;
  tab.focusedVar = null;
  if (tab.tutorActive) showTutorStep(tab.tutorStepIndex);
});

graphZoomOutButton.addEventListener("click", () => bumpGraphZoom(-GRAPH_ZOOM_STEP));
graphZoomInButton.addEventListener("click", () => bumpGraphZoom(GRAPH_ZOOM_STEP));
graphZoomInput.addEventListener("change", () => setGraphZoom(graphZoomInput.value));
function bindGraphZoomInput(input) {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      setGraphZoom(input.value);
      input.blur();
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      bumpGraphZoom(GRAPH_ZOOM_STEP);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      bumpGraphZoom(-GRAPH_ZOOM_STEP);
    }
  });
}

bindGraphZoomInput(graphZoomInput);
bindGraphZoomInput(pathZoomInput);
pathZoomOutButton.addEventListener("click", () => bumpGraphZoom(-GRAPH_ZOOM_STEP));
pathZoomInButton.addEventListener("click", () => bumpGraphZoom(GRAPH_ZOOM_STEP));
pathZoomInput.addEventListener("change", () => setGraphZoom(pathZoomInput.value));

function onGraphChromeClick(event) {
  const tab = getActiveTab();
  if (!tab) return;
  const reprButton = event.target.closest("[data-graph-repr]");
  const sourceButton = event.target.closest("[data-graph-source]");
  const searchButton = event.target.closest("[data-graph-search]");
  if (reprButton) tab.graphRepr = reprButton.dataset.graphRepr;
  else if (sourceButton) tab.graphSource = sourceButton.dataset.graphSource;
  else if (searchButton) tab.graphSearch = searchButton.dataset.graphSearch;
  else return;
  if (tab.tutorActive) showTutorStep(tab.tutorStepIndex);
}

tutorGraphView.addEventListener("click", onGraphChromeClick);
tutorPathView.addEventListener("click", onGraphChromeClick);
tutorDsuView.addEventListener("click", (event) => {
  const button = event.target.closest("[data-dsu-source]");
  const tab = getActiveTab();
  if (!button || !tab) return;
  tab.dsuSource = button.dataset.dsuSource;
  if (tab.tutorActive) showTutorStep(tab.tutorStepIndex);
});

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
