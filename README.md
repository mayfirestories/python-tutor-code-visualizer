# Python Code Visualizer & Stepper

A browser-based, interactive Python execution and memory visualizer inspired by Python Tutor. It runs real Python code directly in your browser using [Pyodide](https://pyodide.org/) (CPython compiled to WebAssembly), requiring no backend server.

---

## Features

- **Real Python in the Browser**: Executes standard Python 3 code (functions, classes, loops, dicts, recursion, etc.) client-side via WebAssembly.
- **Multi-Tab File Manager**:
  - Starts with `Tab 1` (file 1).
  - Click the **`+`** button to open additional tabs (`Tab 2`, `Tab 3`, etc.).
  - Click **`×`** to close a tab (active when 2 or more tabs are open).
  - Each tab keeps its own independent code, execution trace, and console state.
- **Interactive Execution Stepper**:
  - **`Next line →`** & **`← Previous`**: Step statement by statement through code execution.
  - **`Next loop iteration ⟳`**: Jump directly to the next pass of the current loop.
  - **`First`** & **`Last`**: Instantly jump to the start or end of execution.
  - **Scrubber Slider**: Scrub to any execution step.
- **Memory Visualizer**:
  - **Frames**: Displays call stack frames and their active local variables.
  - **Objects**: Visualizes lists, dictionaries, tuples, sets, and object instances on the heap, labeled with their variable names (e.g. `students`, `preferences`) instead of raw memory addresses.
- **Full-Width Responsive UI**: Stretches across the screen to maximize editing and visualization space on modern displays.

---

## Prerequisites

To run the application locally, you only need Python 3 installed (used simply to serve static files over HTTP).

Verify Python is installed:

```bash
python --version
```

> **Note**: Serving via HTTP is required because browsers block WebAssembly and web workers from loading over the `file://` protocol.

---

## How to Setup and Run Locally

### Option 1: Using Python's Built-in HTTP Server (Recommended)

1. Open your terminal or PowerShell and navigate into the `python_tutor` directory:

   ```bash
   cd python_tutor
   ```

2. Start a local HTTP server on port 8000:

   **Windows (PowerShell or Command Prompt):**
   ```powershell
   python -m http.server 8000
   ```

   **macOS / Linux:**
   ```bash
   python3 -m http.server 8000
   ```

3. Open your browser and visit:

   [http://localhost:8000](http://localhost:8000)

4. Press `Ctrl + C` in the terminal when you want to stop the server.

---

### Option 2: Using VS Code Live Server Extension

If you use VS Code or Cursor:

1. Install the **Live Server** extension (by Ritwick Dey).
2. Right-click `python_tutor/index.html` in the file explorer.
3. Select **Open with Live Server**.

---

### Option 3: Using Node.js / npx

If you prefer Node:

```bash
cd python_tutor
npx serve
```

Then open the URL printed in the terminal (usually `http://localhost:3000`).

---

## How to Use

1. **Write or Paste Code**:
   - Enter your Python code in the active tab on the left.
   - Use standard indentation (the editor supports the `Tab` key with 4 spaces).
2. **Run Directly**:
   - Click **`▶ Run`** to execute the program from start to finish and view output in the Console.
3. **Step & Visualize**:
   - Click **`Visualize`** to construct an execution trace.
   - Use **`Next line →`** to step statement by statement.
   - Use **`Next loop iteration ⟳`** to advance through loops without clicking through every internal line.
   - Watch local variables update in the **Frames** panel and data structures update in the **Objects** panel.
   - Click **`Edit code`** anytime to exit visualizer mode and edit your script.
4. **Work with Multiple Files**:
   - Click **`+`** in the tab bar to create a new tab.
   - Switch back and forth between tabs without losing your code or active visualization position.

---

## File Structure

```text
python_tutor/
├── index.html       # Visualizer interface layout & controls
├── style.css        # Full-width dark mode theme and styling
├── script.js        # Pyodide runtime loader, tracer, multi-tab state & UI handlers
└── README.md        # Instructions and documentation
```
