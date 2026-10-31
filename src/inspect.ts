export type InspectorPath = readonly (string | number)[];

export interface InspectorRow {
  path: InspectorPath;
  id: string;
  label: string;
  depth: number;
  value: unknown;
  summary: string;
  expandable: boolean;
  circular: boolean;
  accessor: boolean;
}

export interface InspectOptions {
  expandedPaths?: readonly string[];
  query?: string;
  maxDepth?: number;
  maxNodes?: number;
  maxChildren?: number;
}

export interface InspectResult {
  rows: InspectorRow[];
  visited: number;
  truncated: boolean;
}

export const INSPECTOR_LIMITS = Object.freeze({
  depth: 50,
  nodes: 10_000,
  children: 1_000,
  queryLength: 1_000,
});

export function formatInspectorPath(path: InspectorPath): string {
  return (
    '$' +
    path.map((key) => (typeof key === 'number' ? `[${key}]` : `[${JSON.stringify(key)}]`)).join('')
  );
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

export function summarizeValue(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'undefined':
      return 'undefined';
    case 'string':
      return JSON.stringify(value.length > 200 ? value.slice(0, 200) + '...' : value);
    case 'number':
      return Object.is(value, -0) ? '-0' : String(value);
    case 'boolean':
      return String(value);
    case 'bigint':
      return `${value}n`;
    case 'symbol':
      return String(value);
    case 'function':
      return '[Function]';
    default:
      try {
        if (Array.isArray(value)) {
          const length = Object.getOwnPropertyDescriptor(value, 'length');
          return `Array(${length?.value ?? '?'})`;
        }
        return 'Object';
      } catch {
        return '[Unavailable]';
      }
  }
}

function validateInteger(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  }
}

/** Reads own enumerable string-keyed descriptors only. Accessors are never invoked. */
export function inspectValue(value: unknown, options: InspectOptions = {}): InspectResult {
  const maxDepth = options.maxDepth ?? 8;
  const maxNodes = options.maxNodes ?? 1_000;
  const maxChildren = options.maxChildren ?? 100;
  validateInteger('maxDepth', maxDepth, 0, INSPECTOR_LIMITS.depth);
  validateInteger('maxNodes', maxNodes, 1, INSPECTOR_LIMITS.nodes);
  validateInteger('maxChildren', maxChildren, 1, INSPECTOR_LIMITS.children);
  const query = options.query ?? '';
  if (query.length > INSPECTOR_LIMITS.queryLength) throw new RangeError('query is too long');
  const needle = query.toLowerCase();
  const expanded = new Set(options.expandedPaths ?? ['$']);
  const rows: InspectorRow[] = [];
  let visited = 0;
  let truncated = false;
  const ancestors = new Map<object, string>();

  const visit = (
    current: unknown,
    path: (string | number)[],
    accessor = false,
    unavailable = false,
  ): void => {
    if (visited >= maxNodes) {
      truncated = true;
      return;
    }
    visited++;
    const id = formatInspectorPath(path);
    const depth = path.length;
    const object = !accessor && !unavailable && isObject(current);
    const circular = object && ancestors.has(current);
    const expandable = object && !circular && depth < maxDepth;
    let summary = accessor
      ? '[Getter/Setter]'
      : unavailable
        ? '[Unavailable]'
        : summarizeValue(current);
    if (circular) summary = `[Circular -> ${ancestors.get(current as object)}]`;
    if (object && !circular && depth === maxDepth) {
      summary += ' [Depth limit]';
      truncated = true;
    }
    if (!needle || `${id} ${summary}`.toLowerCase().includes(needle)) {
      rows.push({
        path,
        id,
        label: path.length ? String(path[path.length - 1]) : '$',
        depth,
        value: current,
        summary,
        expandable,
        circular,
        accessor,
      });
    }
    if (!expandable || (!needle && !expanded.has(id))) return;
    ancestors.set(current, id);
    try {
      const keys = Object.getOwnPropertyNames(current);
      let children = 0;
      for (const key of keys) {
        if (visited >= maxNodes) {
          truncated = true;
          break;
        }
        let descriptor: PropertyDescriptor | undefined;
        try {
          descriptor = Object.getOwnPropertyDescriptor(current, key);
        } catch {
          if (children >= maxChildren) {
            truncated = true;
            break;
          }
          children++;
          visit(undefined, [...path, key], false, true);
          continue;
        }
        if (!descriptor?.enumerable) continue;
        if (children >= maxChildren) {
          truncated = true;
          break;
        }
        children++;
        const segment =
          Array.isArray(current) && /^(0|[1-9]\d*)$/.test(key) && Number(key) < 4_294_967_295
            ? Number(key)
            : key;
        visit(descriptor.value, [...path, segment], !('value' in descriptor));
      }
    } catch {
      const row = rows.find((item) => item.id === id);
      if (row) {
        row.summary = '[Unavailable]';
        row.expandable = false;
      }
    } finally {
      ancestors.delete(current);
    }
  };
  visit(value, []);
  return { rows, visited, truncated };
}
