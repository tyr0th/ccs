import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

function loadWorkflow() {
  const workflowPath = path.resolve(import.meta.dir, '../../../../.github/workflows/ai-review.yml');
  return yaml.load(fs.readFileSync(workflowPath, 'utf8')) as {
    jobs: {
      review: {
        steps: Array<Record<string, any>>;
      };
    };
  };
}

describe('ai-review workflow', () => {
  test('uses the self-hosted Claude binary instead of reinstalling it on internal PRs', () => {
    const workflow = loadWorkflow();
    const steps = workflow.jobs.review.steps;

    const toolchainStep = steps.find((step) => step.id === 'toolchain');
    expect(toolchainStep).toBeDefined();
    expect(toolchainStep?.name).toBe('Resolve self-hosted Claude executable');
    expect(toolchainStep?.run).toContain('CLAUDE_PATH="/root/.local/bin/claude"');
    expect(toolchainStep?.run).toContain('Missing self-hosted Claude executable');
    expect(toolchainStep?.run).toContain('echo "claude_path=$CLAUDE_PATH" >> "$GITHUB_OUTPUT"');

    const claudeReviewStep = steps.find((step) => step.id === 'claude-review');
    expect(claudeReviewStep).toBeDefined();
    expect(claudeReviewStep?.uses).toBe('anthropics/claude-code-action@v1');
    expect(claudeReviewStep?.with?.path_to_claude_code_executable).toBe(
      '${{ steps.toolchain.outputs.claude_path }}'
    );

    const promptStep = steps.find((step) => step.id === 'review-prompt');
    expect(promptStep).toBeDefined();
    expect(promptStep?.run).toContain("printf '%s\\n' \\");
    expect(promptStep?.run).not.toContain("| sed 's/^            //'");
  });
});
