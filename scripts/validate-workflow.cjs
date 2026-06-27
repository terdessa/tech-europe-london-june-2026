const workflow = require('../Flash-Agent.json');

const requiredWebhooks = new Set([
  'POST agent',
  'GET events',
  'POST ask',
  'POST finalize',
  'POST vision',
]);

const nodeNames = new Set(workflow.nodes.map((node) => node.name));
const errors = [];

for (const node of workflow.nodes) {
  if (!node.name) errors.push('A node is missing name.');
  if (!node.type) errors.push(`${node.name || 'Unnamed node'} is missing type.`);

  const jsCode = node.parameters?.jsCode;
  if (jsCode) {
    try {
      new Function(jsCode);
    } catch (error) {
      errors.push(`${node.name} has invalid JavaScript: ${error.message}`);
    }
  }
}

for (const [from, outputs] of Object.entries(workflow.connections || {})) {
  if (!nodeNames.has(from)) errors.push(`Connection starts from missing node: ${from}`);

  for (const output of outputs.main || []) {
    for (const edge of output) {
      if (!nodeNames.has(edge.node)) {
        errors.push(`Connection from ${from} points to missing node: ${edge.node}`);
      }
    }
  }
}

const webhooks = workflow.nodes
  .filter((node) => node.type === 'n8n-nodes-base.webhook')
  .map((node) => `${node.parameters.httpMethod} ${node.parameters.path}`);

for (const webhook of requiredWebhooks) {
  if (!webhooks.includes(webhook)) errors.push(`Missing webhook: ${webhook}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Workflow OK: ${workflow.nodes.length} nodes, ${webhooks.length} webhooks.`);
