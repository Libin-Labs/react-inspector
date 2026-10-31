import {
  Inspector,
  inspectValue,
  summarizeValue,
  formatInspectorPath,
  INSPECTOR_LIMITS,
  type InspectorProps,
  type InspectorPath,
  type InspectorRow,
  type InspectOptions,
  type InspectResult,
} from '@lp-labs/react-inspector';

const path: InspectorPath = ['a', 0];
const options: InspectOptions = { expandedPaths: [formatInspectorPath(path)] };
const result: InspectResult = inspectValue({}, options);
const row: InspectorRow | undefined = result.rows[0];
const props: InspectorProps = {
  value: {},
  onCopyPath: async (id, parts) => {
    void id;
    void parts;
  },
};
void [Inspector, props, row, summarizeValue(null), INSPECTOR_LIMITS];
