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
import io
import json
import sys
import traceback

MAX_STEPS = 500
SKIP_NAMES = {
    "__name__", "__doc__", "__package__", "__loader__", "__spec__",
    "__annotations__", "__builtins__", "tutor_trace", "USER_SOURCE"
}

def _tutor_encode(value, heap, depth=0):
    if depth > 4:
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
    if isinstance(value, (list, tuple, set, frozenset, dict)) or hasattr(value, "__dict__"):
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
        if isinstance(value, (list, tuple, set, frozenset)):
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
    tutorStatus: ""
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
  renderTutorFrames(step.frames, step.heap, labels, names);
  renderTutorHeap(step.heap, labels);

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
