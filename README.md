# AxCSS

AXCSS is a CSS compiler that transforms `.axcss` files into standard CSS. It adds support for **components**, **instances**, **variables**, **conditional `when` blocks**, **recursive imports**, and preserves normal CSS. During `build` it also generates JS proxies (`.axcss.js`) and a global `.axcss/axcssMain.js` so styles can be easily imported/injected from JavaScript (plain JS, React, Vue, etc.).

---

## Requirements

* Node.js >= 18

---

## Installation

```bash
npm install -g axcss
```

---

## Example `.axcss`

### Basic Component Definition

`src/button.axcss`:

```css
component Button($color: #07f, $size: 1rem, $variant: primary) {
  .root {
    background: $color;
    padding: $size;
    border-radius: 4px;
  }

  when $variant == primary {
    .root { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
  }
}

Button.primary {
  $color: #007bff;
  $size: 1.25rem;
}
```

### Import System

You can import other `.axcss` files using the `@import` directive. This allows you to:
- Reuse components across different files
- Organize your styles into logical modules
- Create component libraries

Example usage:

`src/styles/main.axcss`:
```css
/* Import components */
@import "./button.axcss";
@import "./card.axcss";

/* Define instances of imported components */
Button.primary-large {
  $color: #007bff;
  $size: 1.5rem;
  $variant: primary;
}

Card.primary {
  $color: #0af;
  $size: large;
  $radius: 0.1rem;
}
```

#### How Imports Work
1. When you use `@import`, the content of the imported file is processed first
2. All component definitions from the imported file become available in the current file
3. You can create instances of components defined in imported files
4. The final CSS output will include styles from all imported files

#### Best Practices
- Use relative paths for imports (e.g., `./components/Button.axcss`)
- Import files before using their components
- Organize imports logically (utilities first, then components, then instances)

After `axcss build` you’ll get:

* `.axcss/src/button.css`
* `.axcss/src/button.axcss.js`
* entry in `.axcss/axcssMain.js`

---


## Commands

**Build all `.axcss` files into `.css`, generate per-file JS proxies and the global `axcssMain.js`.**

```bash
axcss build
```

**Start watch mode: watch `**/*.axcss` and rebuild on changes (quiet output).**

```bash
axcss dev
```

You can also add scripts to `package.json`:

```json
{
  "scripts": {
    "build": "axcss build",
    "dev": "axcss dev"
  }
}
```

---

## Output structure (what `build` creates)

When you run `axcss build`:

* Compiled CSS files are written to: `.axcss/<relative_path>.css`
  Example: `src/styles/button.axcss` → `.axcss/src/styles/button.css`

* A JS proxy is generated for each compiled CSS: `.axcss/.../*.axcss.js`
  Example: `.axcss/src/styles/button.axcss.js` — when imported in the browser this proxy **creates and appends a `<link rel="stylesheet">`** pointing to the compiled `.css`, and exports the CSS path.

* A global file `.axcss/axcssMain.js` is created that:

  * imports all proxies (so importing `axcssMain.js` auto-injects every compiled CSS into the DOM),
  * exports an object `axcssMain` that maps friendly keys to compiled `.css` paths.

---

## How to include / reference styles from JS or React

### 1) Global automatic import (inject everything)

Import the generated `axcssMain.js` once in your app entry (e.g. `index.js`, `main.js`, `src/main.jsx`):

```js
// imports all generated proxies and injects all compiled CSS into <head>
import './.axcss/axcssMain.js';

// you can also access the paths object if needed
import { axcssMain } from './.axcss/axcssMain.js';
console.log(axcssMain); // { "main": "./.axcss/main.css", ... }
```

**Pros:** One import ensures all compiled CSS is present. Simple for small projects or demos.

---

### 2) Import a single stylesheet (per-component / per-module)

Import the corresponding proxy `.axcss.js` for the specific `.axcss` you need:

```js
// injects the single stylesheet when this module is loaded
import './.axcss/src/styles/button.axcss.js';
```

Each proxy runs code similar to:

```js
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = './.axcss/src/styles/button.css';
document.head.appendChild(link);
export default './.axcss/src/styles/button.css';
```

**Use case:** import in a component that needs that style only.

---

### 3) Manual control using `axcssMain`

If you prefer to control injection yourself, use the exported `axcssMain`:

```js
import { axcssMain } from './.axcss/axcssMain.js';

const cssPath = axcssMain['button']; // './.axcss/src/styles/button.css'
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = cssPath;
document.head.appendChild(link);
```

---

## Quick example (React entry)

`src/main.jsx`:

```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';

// Option A: inject all styles
import '../.axcss/axcssMain.js';

// Option B: import only one
// import '../.axcss/src/styles/button.axcss.js';

import App from './App';

createRoot(document.getElementById('root')).render(<App />);
```

> If you use SSR or run code on the server, avoid importing proxies on the server side. Either import only in client entry point or guard injections with `if (typeof document !== 'undefined')`.

---

## Features overview

* Preserves regular CSS in `.axcss` files.
* `component` blocks: reusable templates with parameters (`$var`) and defaults.
* `ComponentName.instanceName { $var: value }` — create instances from components.
* `when $var == value { ... }` — conditional CSS blocks evaluated at compile time.
* Recursive `@import "./file.axcss";` resolution with cycle handling and warnings.
* Analyzer that reports unbalanced braces, missing defaults, unknown variables, malformed rules, etc.
* Generated `.axcss.js` proxies for simple runtime injection.
* A single `.axcss/axcssMain.js` which imports proxies and exports `axcssMain` mapping.

---

## Notes & troubleshooting

* **Serve over HTTP**: `file://` imports often fail due to browser CORS or module loading restrictions. Run a local server (e.g. `vite`, `npm run dev`, `npx serve`).
* **Paths**: Bundlers (Vite/webpack) resolve imports relative to your project. Import `./.axcss/axcssMain.js` from the project root (or your app entry) so the generated relative paths resolve correctly.
* **Watch mode**: `axcss dev` watches changes and performs rebuilds. The watcher emits concise output to avoid noise.
* **Avoid double `.axcss` duplication**: access proxies and `axcssMain` using paths generated inside `.axcss/` (import them from your bundled entry so bundler serves the files correctly).
* **SSR**: the proxies inject styles into `document.head`. Do not import them in server-side code unless you guard for `document`.

---

## Contributing / Development

1. Clone the repo:

   ```bash
   git clone https://github.com/ZtaMDev/axcss
   cd axcss
   ```
2. Install dependencies:

   ```bash
   npm install
   ```
3. Link locally for testing:

   ```bash
   npm link
   ```
4. Use:

   ```bash
   axcss build   # build once
   axcss dev     # watch mode
   ```

---

## License

MIT

---
