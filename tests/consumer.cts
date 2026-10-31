import inspector = require('@lp-labs/react-inspector');

const options: inspector.InspectOptions = { maxNodes: 10 };
const result: inspector.InspectResult = inspector.inspectValue({}, options);
const props: inspector.InspectorProps = { value: {} };
void [
  result,
  props,
  inspector.Inspector,
  inspector.formatInspectorPath([]),
  inspector.INSPECTOR_LIMITS,
];
