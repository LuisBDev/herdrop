import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type AgentInfoJson = {
  agent: string;
  agent_session: null;
  agent_status: string;
  cwd: string;
  foreground_cwd: string | null;
  focused: boolean;
  interactive_ready: boolean;
  name: string | null;
  pane_id: string;
  revision: number;
  state_change_seq: number;
  tab_id: string;
  terminal_id: string;
  terminal_title: string;
  terminal_title_stripped: string;
  workspace_id: string;
};

export type MachineProfileJson = {
  id: string;
  label: string;
  target: string;
  session: string;
  enabled: boolean;
  selected: boolean;
};

export type PromptOutcome =
  | 'ok'
  | 'agent_prompt_stalled'
  | 'timeout'
  | 'agent_blocked'
  | 'agent_not_found'
  | 'agent_not_running'
  | 'error';

export type Scenario = {
  machines: MachineProfileJson[];
  agents: Record<string, AgentInfoJson[]>;
  prompt: { outcome: PromptOutcome; delay_ms: number };
};

export type LogEntry = { bin: 'herdr' | 'ssh'; argv: string[] };

export function agent({
  pane,
  cwd,
  status = 'idle',
  title,
  kind = 'claude',
  focused = false,
}: {
  pane: string;
  cwd: string;
  status?: string;
  title: string;
  kind?: string;
  focused?: boolean;
}): AgentInfoJson {
  return {
    agent: kind,
    agent_session: null,
    agent_status: status,
    cwd,
    foreground_cwd: null,
    focused,
    interactive_ready: true,
    name: null,
    pane_id: pane,
    revision: 1,
    state_change_seq: 1,
    tab_id: 'w1:t1',
    terminal_id: 'term_1',
    terminal_title: title,
    terminal_title_stripped: title,
    workspace_id: 'w1',
  };
}

export function machine({
  id,
  label,
  target,
}: {
  id: string;
  label: string;
  target: string;
}): MachineProfileJson {
  return { id, label, target, session: 'default', enabled: true, selected: false };
}

export function makeAgentDir(root: string, name: string): string {
  return mkdtempSync(join(root, `herdrop e2e facturación ${name} `));
}

export function writeScenario(dir: string, scenario: Scenario): void {
  writeFileSync(join(dir, 'scenario.json'), JSON.stringify(scenario));
}

export function readLog(dir: string): LogEntry[] {
  const path = join(dir, 'log.jsonl');
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as LogEntry);
}

export function promptCalls(dir: string): string[][] {
  return readLog(dir)
    .filter(
      (entry) =>
        entry.bin === 'herdr' &&
        entry.argv.some((arg, index) => arg === 'agent' && entry.argv[index + 1] === 'prompt'),
    )
    .map((entry) => entry.argv);
}
