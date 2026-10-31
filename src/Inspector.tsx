import { useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  inspectValue,
  type InspectOptions,
  type InspectorPath,
  type InspectorRow,
} from './inspect.js';

export interface InspectorProps extends InspectOptions {
  value: unknown;
  onExpandedPathsChange?: (paths: string[], path: string, expanded: boolean) => void;
  onQueryChange?: (query: string) => void;
  showSearch?: boolean;
  enableCopy?: boolean;
  onCopyPath?: (formatted: string, path: InspectorPath) => void | Promise<void>;
  onCopyError?: (error: unknown) => void;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  renderValue?: (row: InspectorRow) => ReactNode;
}

const ROOT_EXPANDED: readonly string[] = ['$'];

export function Inspector({
  value,
  expandedPaths = ROOT_EXPANDED,
  query = '',
  maxDepth = 8,
  maxNodes = 1_000,
  maxChildren = 100,
  onExpandedPathsChange,
  onQueryChange,
  showSearch = false,
  enableCopy = false,
  onCopyPath,
  onCopyError,
  className = '',
  style,
  ariaLabel = 'Object inspector',
  renderValue,
}: InspectorProps): ReactNode {
  const result = useMemo(
    () =>
      inspectValue(value, {
        expandedPaths,
        query,
        maxDepth,
        maxNodes,
        maxChildren,
      }),
    [value, expandedPaths, query, maxDepth, maxNodes, maxChildren],
  );
  const expanded = new Set(expandedPaths);
  const toggle = (id: string): void => {
    const next = new Set(expanded);
    const opening = !next.has(id);
    if (opening) next.add(id);
    else next.delete(id);
    onExpandedPathsChange?.([...next], id, opening);
  };
  const copy = async (row: InspectorRow): Promise<void> => {
    try {
      if (onCopyPath) await onCopyPath(row.id, row.path);
      else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(row.id);
      } else {
        throw new Error('Clipboard is unavailable; provide onCopyPath');
      }
    } catch (error) {
      onCopyError?.(error);
    }
  };
  return (
    <section className={`lp-inspector ${className}`} style={style} aria-label={ariaLabel}>
      {showSearch && (
        <input
          type="search"
          aria-label="Search object"
          value={query}
          maxLength={1_000}
          readOnly={!onQueryChange}
          onChange={(event) => onQueryChange?.(event.target.value)}
        />
      )}
      <ul className="lp-inspector__rows" aria-label="Object properties">
        {result.rows.map((row) => (
          <li
            key={row.id}
            className="lp-inspector__row"
            style={{ paddingLeft: `${row.depth * 1.25}rem` }}
          >
            {row.expandable && !query ? (
              <button
                type="button"
                aria-label={`Toggle ${row.id}`}
                aria-expanded={expanded.has(row.id)}
                disabled={!onExpandedPathsChange}
                onClick={() => toggle(row.id)}
              >
                {expanded.has(row.id) ? '-' : '+'}
              </button>
            ) : (
              <span className="lp-inspector__spacer" aria-hidden="true" />
            )}
            <span className="lp-inspector__key" title={row.id}>
              {query ? row.id : row.label}
            </span>
            <span aria-hidden="true">: </span>
            <span className="lp-inspector__value">
              {renderValue ? renderValue(row) : row.summary}
            </span>
            {enableCopy && (
              <button
                type="button"
                aria-label={`Copy path ${row.id}`}
                onClick={() => {
                  void copy(row);
                }}
              >
                Copy path
              </button>
            )}
          </li>
        ))}
      </ul>
      {result.rows.length === 0 && <p>No matching properties</p>}
      {result.truncated && (
        <p role="status">Inspection limited by depth, children, or node budget.</p>
      )}
    </section>
  );
}
