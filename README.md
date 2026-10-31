# @lp-labs/react-inspector

Package version: `1.0.0`.

An expandable, controlled React object inspector with descriptor-based
inspection, cycle detection, bounded search, and optional path copying.
React `^18.2 || ^19` is the only peer and there are no runtime dependencies.
ESM and CommonJS entry points both include matching declarations.

## Install

```sh
npm install @lp-labs/react-inspector react
```

```tsx
import { useState } from "react";
import { Inspector } from "@lp-labs/react-inspector";
import "@lp-labs/react-inspector/styles.css";

const data = { users: [{ name: "Ada", active: true }], count: 1 };

export function ObjectExample() {
  const [expanded, setExpanded] = useState<string[]>(["$"]);
  const [query, setQuery] = useState("");
  return (
    <Inspector
      value={data}
      expandedPaths={expanded}
      onExpandedPathsChange={setExpanded}
      showSearch
      query={query}
      onQueryChange={setQuery}
      enableCopy
      onCopyError={(error) => console.error("Could not copy path", error)}
    />
  );
}
```

Replace object/array references when values change; inspection is memoized by
reference and options. Expansion and search are controlled: a callback alone
does not change props. Root expansion defaults to `["$"]`; use `[]` for a
collapsed root. Without a change callback, expansion buttons are disabled and
the search input is read-only. Search traverses collapsed descendants within
budgets, shows matching rows as flat paths, and hides expand buttons until the
query is cleared. It never evaluates accessor values.

## Public exports

- `Inspector` and type `InspectorProps`.
- `inspectValue(value: unknown, options?: InspectOptions): InspectResult`.
- `summarizeValue(value: unknown): string`.
- `formatInspectorPath(path: InspectorPath): string`.
- Frozen `INSPECTOR_LIMITS`: `{ depth: 50, nodes: 10000, children: 1000,
  queryLength: 1000 }`.
- Types `InspectorPath`, `InspectorRow`, `InspectOptions`, `InspectResult`.

`InspectorPath` is `readonly (string | number)[]`. Paths start at `$`, use
JSON-quoted bracket notation for string keys, and numeric brackets for array
indices: `$["users"][0]["name"]`. Dot-containing, quoted, and special keys
remain unambiguous. These paths describe properties; **do not use `eval` to
resolve them**.

`InspectorRow` contains:

| Field | Meaning |
| --- | --- |
| `path`, `id` | Segment array and formatted path |
| `label`, `depth` | Key label (`"$"` for root) and path length |
| `value: unknown` | Data descriptor value; `undefined` for inaccessible/accessor properties |
| `summary: string` | Safe bounded primitive/object label or safety marker |
| `expandable: boolean` | Object within depth budget and not a circular ancestor |
| `circular: boolean` | Reference points to an ancestor in this traversal |
| `accessor: boolean` | Getter and/or setter descriptor, never evaluated |

`InspectResult` is `{ rows: InspectorRow[], visited: number, truncated: boolean }`.
`visited` counts examined nodes, not matching rows. `truncated` indicates a
depth, child, or node budget stopped inspection. Collapsed branches alone do
not mark truncation. An object at the depth limit is conservatively marked
limited without enumerating it, even if it might be empty. A throwing proxy
is marked `[Unavailable]`, not silently represented as an ordinary value.

```tsx
import { inspectValue, formatInspectorPath } from "@lp-labs/react-inspector";

const data = { users: [{ name: "Ada" }] };
const report = inspectValue(data, {
  expandedPaths: ["$", formatInspectorPath(["users"])],
  maxNodes: 200
});
const search = inspectValue(data, { query: "ada", maxDepth: 6 });
// Both helpers are synchronous, deterministic for ordinary stable objects,
// and do not mutate data or invoke property getters.
```

## Props and options

`value: unknown` is required. All other props are optional.

| Prop | Type | Default / behavior |
| --- | --- | --- |
| `expandedPaths` | `readonly string[]` | `["$"]` |
| `onExpandedPathsChange` | `(paths: string[], path: string, expanded: boolean) => void` | Proposes full new set and toggled path |
| `query` | `string` | `""`; case-insensitive literal path/summary search |
| `onQueryChange` | `(query: string) => void` | Input change proposal |
| `showSearch` | `boolean` | `false` |
| `maxDepth` | `number` | `8`; integer 0-50 |
| `maxNodes` | `number` | `1000`; integer 1-10000 |
| `maxChildren` | `number` | `100`; integer 1-1000 per expanded object |
| `enableCopy` | `boolean` | `false`; add path-copy buttons |
| `onCopyPath` | `(formatted: string, path: InspectorPath) => void \| Promise<void>` | Override browser clipboard action |
| `onCopyError` | `(error: unknown) => void` | Reports copy failures; absent handler silently ignores them |
| `renderValue` | `(row: InspectorRow) => ReactNode` | Render `row.summary` |
| `className`, `style` | `string`, `CSSProperties` | `""`, no inline root style |
| `ariaLabel` | `string` | `"Object inspector"` |

`InspectOptions` contains only `expandedPaths`, `query`, `maxDepth`,
`maxNodes`, and `maxChildren`, with the same defaults. Query length is limited
to 1000 UTF-16 code units. Invalid numeric budgets or oversized query throw
`RangeError`, including for primitive roots. Component errors propagate to
your React error boundary.

With copying enabled and no `onCopyPath`, the component calls
`navigator.clipboard.writeText(formattedPath)`. Clipboard support/permissions
and usually a secure context are required. Supplying `onCopyPath` replaces
that operation entirely; implement your own clipboard or display workflow.
Errors from either route reach `onCopyError`.

Clipboard/custom-copy promises have no cancellation API and may complete after
unmount; applications own any associated UI lifecycle. Import does not access
the clipboard or browser globals. Helper-only use needs no DOM, but the root
entry still requires its React peer to resolve.

## Customization and accessibility

```tsx
<Inspector
  value={data}
  className="debug-panel"
  renderValue={(row) => <code title={row.id}>{row.summary}</code>}
  enableCopy
  onCopyPath={(formatted) => navigator.clipboard.writeText(formatted)}
/>
```

Override `--lp-inspector-key` and `--lp-inspector-value` on `.lp-inspector`.
Rows are a semantic list, not an ARIA tree pretending to support tree-key
navigation. Expansion and copy actions are native buttons with path labels;
expansion exposes `aria-expanded`. Search is labeled, and limits have a
status message. Standard Tab/Enter/Space behavior applies; no custom arrow
navigation or focus relocation is implemented. Use contrast-appropriate
theme colors. Source strings are React-escaped text.

## Safety, supported data, and honest limits

Only own enumerable **string-keyed** properties are traversed in JavaScript
property order. Arrays use actual stored elements/properties, so holes do not
allocate placeholder nodes. Inherited, symbol-keyed, and non-enumerable
properties are omitted. Maps, Sets, Dates, typed arrays, class instances, and
functions do not receive special evaluators: objects show their enumerable
own properties; functions show `[Function]` and do not expand. Strings in
summaries are shortened after 200 code units. Circular ancestor references
show their target path; the same shared object in separate branches may be
expanded independently.

There is deliberately no "evaluate getter" option. No object `toString`,
`toJSON`, or getter is called by the inspector's traversal. Proxy
`ownKeys`/descriptor traps necessarily execute user code and cannot be made
safe or time-bounded; caught errors become `[Unavailable]`. Do not treat this
as a sandbox for hostile objects. React development diagnostics and external
devtools may inspect props independently, including getters when comparing
changed object references; this package cannot control those tools.

Traversal and displayed rows are bounded, but `Object.getOwnPropertyNames`
must enumerate an object's full key list before per-object truncation.
Very wide objects, proxies, and many non-enumerable properties can therefore
still be expensive. Search is synchronous and not an index. Rendering is not
virtualized. Defaults aim at debugging-sized data, not millions of properties.
Custom renderers receive original values; do not invoke unsafe getters or
inject HTML from them.

## Provenance

Independently authored for this project, not copied from an
existing inspector library. This provenance statement is not a legal
guarantee; review the license and suitability for your use.

## License

[MIT](./LICENSE).

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
