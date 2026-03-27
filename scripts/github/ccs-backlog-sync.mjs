const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  console.error('Missing GH_TOKEN or GITHUB_TOKEN');
  process.exit(1);
}
const owner = process.env.CCS_PROJECT_OWNER || 'kaitranntt';
const projectNumber = Number(process.env.CCS_PROJECT_NUMBER || '3');
const repoFullName = process.env.GITHUB_REPOSITORY || 'kaitranntt/ccs';
const [repoOwner, repoName] = repoFullName.split('/');
const PRIORITY_FOR = { bug: 'P1', default: 'P2', split: 'P3' };
const FOLLOW_UP_FOR = {
  ready: 'Ready',
  repro: 'Needs repro',
  upstream: 'Blocked upstream',
  split: 'Needs split',
  docs: 'Docs follow-up',
};
const PROJECT_QUERY = `query($owner: String!, $number: Int!) {
  user(login: $owner) {
    projectV2(number: $number) {
      id
      fields(first: 50) { nodes { __typename ... on ProjectV2Field { id name } ... on ProjectV2SingleSelectField { id name options { id name } } } }
      items(first: 100) { nodes { id content { __typename ... on Issue { number id repository { nameWithOwner } } } } }
    }
  }
}`;
const ADD_ITEM_MUTATION = `mutation($projectId: ID!, $contentId: ID!) {
  addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) { item { id } }
}`;
const SET_SINGLE_SELECT_MUTATION = `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { singleSelectOptionId: $optionId }
  }) { projectV2Item { id } }
}`;
const SET_DATE_MUTATION = `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $date: Date!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { date: $date }
  }) { projectV2Item { id } }
}`;
const CLEAR_FIELD_MUTATION = `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
  clearProjectV2ItemFieldValue(input: {projectId: $projectId, itemId: $itemId, fieldId: $fieldId}) { projectV2Item { id } }
}`;

function isoDate(daysFromNow) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + daysFromNow);
  return now.toISOString().slice(0, 10);
}

function classify(labels, state) {
  const names = new Set(labels.map((label) => label.name));
  const priority = names.has('bug')
    ? PRIORITY_FOR.bug
    : names.has('needs-split')
      ? PRIORITY_FOR.split
      : PRIORITY_FOR.default;

  let followUp = FOLLOW_UP_FOR.ready;
  let nextReview = null;
  if (state === 'closed') return { priority, followUp, nextReview, status: 'Done' };
  if (names.has('upstream-blocked')) {
    followUp = FOLLOW_UP_FOR.upstream;
    nextReview = isoDate(7);
  } else if (names.has('needs-repro')) {
    followUp = FOLLOW_UP_FOR.repro;
    nextReview = isoDate(14);
  } else if (names.has('needs-split')) {
    followUp = FOLLOW_UP_FOR.split;
    nextReview = isoDate(14);
  } else if (names.has('docs-gap')) {
    followUp = FOLLOW_UP_FOR.docs;
    nextReview = isoDate(7);
  }
  return { priority, followUp, nextReview, status: 'Todo' };
}

async function github(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub REST ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function graphql(query, variables = {}) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json();
  if (!response.ok || json.errors) {
    throw new Error(`GitHub GraphQL failed: ${JSON.stringify(json.errors || json)}`);
  }
  return json.data;
}

async function getProjectContext() {
  const data = await graphql(PROJECT_QUERY, { owner, number: projectNumber });
  const project = data.user?.projectV2;
  if (!project) throw new Error(`Project ${owner}/${projectNumber} not found`);
  const fields = new Map();
  for (const node of project.fields.nodes) {
    if (!node?.name) continue;
    const options = new Map((node.options || []).map((opt) => [opt.name, opt.id]));
    fields.set(node.name, { id: node.id, options });
  }
  const itemsByNumber = new Map();
  for (const node of project.items.nodes) {
    if (
      node?.content?.__typename === 'Issue' &&
      node.content.repository.nameWithOwner === repoFullName
    ) {
      itemsByNumber.set(node.content.number, node.id);
    }
  }
  return { projectId: project.id, fields, itemsByNumber };
}

async function ensureProjectItem(projectId, itemsByNumber, issue) {
  const existing = itemsByNumber.get(issue.number);
  if (existing) return existing;

  const data = await graphql(ADD_ITEM_MUTATION, { projectId, contentId: issue.node_id });
  const itemId = data.addProjectV2ItemById.item.id;
  itemsByNumber.set(issue.number, itemId);
  return itemId;
}

async function setSingleSelect(projectId, itemId, field, optionName) {
  const optionId = field.options.get(optionName);
  if (!optionId) throw new Error(`Missing option "${optionName}" on field ${field.id}`);
  await graphql(SET_SINGLE_SELECT_MUTATION, { projectId, itemId, fieldId: field.id, optionId });
}

async function setDate(projectId, itemId, fieldId, date) {
  if (!date) {
    await graphql(CLEAR_FIELD_MUTATION, { projectId, itemId, fieldId });
    return;
  }
  await graphql(SET_DATE_MUTATION, { projectId, itemId, fieldId, date });
}

async function getTargetIssues() {
  if (process.env.GITHUB_EVENT_PATH) {
    const event = JSON.parse(
      await import('node:fs/promises').then((fs) =>
        fs.readFile(process.env.GITHUB_EVENT_PATH, 'utf8')
      )
    );
    if (event.issue && !event.issue.pull_request) return [event.issue];
  }
  const issues = await github(`/repos/${repoOwner}/${repoName}/issues?state=open&per_page=100`);
  return issues.filter((issue) => !issue.pull_request);
}

async function main() {
  const issues = await getTargetIssues();
  const { projectId, fields, itemsByNumber } = await getProjectContext();
  const statusField = fields.get('Status');
  const priorityField = fields.get('Priority');
  const followUpField = fields.get('Follow-up');
  const nextReviewField = fields.get('Next review');

  for (const issue of issues) {
    const itemId = await ensureProjectItem(projectId, itemsByNumber, issue);
    const plan = classify(issue.labels || [], issue.state);
    await setSingleSelect(projectId, itemId, statusField, plan.status);
    await setSingleSelect(projectId, itemId, priorityField, plan.priority);
    await setSingleSelect(projectId, itemId, followUpField, plan.followUp);
    await setDate(projectId, itemId, nextReviewField.id, plan.nextReview);
    console.log(
      `synced #${issue.number}: ${plan.status} / ${plan.priority} / ${plan.followUp}${plan.nextReview ? ` / ${plan.nextReview}` : ''}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
