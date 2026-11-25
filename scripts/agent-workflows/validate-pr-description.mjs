import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { main, argumentsOf, nonempty } from './common.mjs';

export function validatePrDescription(body) {
  const errors = [];
  const text = String(body ?? '').trim();
  if (!text) {
    return { ok: false, errors: ['PR description is empty'] };
  }

  // 1. Check for unreplaced template comments
  if (/<!--\s*(?:1-2 plain sentences|e\.g\.|Step \d|what broke|Describe the concrete)\b/i.test(text)) {
    errors.push('PR description contains unreplaced template comments (<!-- ... -->)');
  }

  // 2. Check 5-Second Quick Glance callout
  const hasNoteCallout = />\s*\[!NOTE\]/i.test(text);
  const hasQuickGlanceHeader = /###\s*⚡?\s*(?:5-Second\s+)?Quick Glance/i.test(text);
  if (!hasNoteCallout || !hasQuickGlanceHeader) {
    errors.push('Missing top-level "> [!NOTE] ### ⚡ 5-Second Quick Glance" callout');
  }

  const problemMatch = text.match(/🔴\s*\*\*(?:Problem|Trigger)[^*]*\*\*:?\s*([^\n\r]+)/i);
  if (!problemMatch || !problemMatch[1].replace(/<!--.*?-->/g, '').trim()) {
    errors.push('Quick Glance is missing non-empty "🔴 **Problem / Trigger:**" summary');
  }

  const fixMatch = text.match(/🟢\s*\*\*(?:Fix|Change)[^*]*\*\*:?\s*([^\n\r]+)/i);
  if (!fixMatch || !fixMatch[1].replace(/<!--.*?-->/g, '').trim()) {
    errors.push('Quick Glance is missing non-empty "🟢 **Fix / Change:**" summary');
  }

  const impactMatch = text.match(/(?:🛡️|🛡)\s*\*\*(?:Scope|Impact)[^*]*\*\*:?\s*([^\n\r]+)/i);
  if (!impactMatch || !impactMatch[1].replace(/<!--.*?-->/g, '').trim()) {
    errors.push('Quick Glance is missing non-empty "🛡️ **Scope & Impact:**" summary');
  }

  // 3. Check Scope Risk Matrix table
  const hasTable = /\|[^\n]+\|[^\n]+\|\s*\n\s*\|(?:\s*:?-+:?\s*\|)+\s*\n\s*\|[^\n]+\|/m.test(text);
  if (!hasTable) {
    errors.push('Missing component risk matrix table (| Area / Component | Change Summary | Production Risk |)');
  }

  // 4. Check Mandatory Mermaid diagram
  const mermaidMatch = text.match(/```mermaid\s*\n([\s\S]*?)\n```/);
  if (!mermaidMatch) {
    errors.push('Missing mandatory visual diagram (```mermaid ... ```)');
  } else {
    const diagramCode = mermaidMatch[1].trim();
    const validDiagramTypes = /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram)\b/m;
    if (!validDiagramTypes.test(diagramCode)) {
      errors.push('Mermaid diagram must specify a valid diagram type (e.g. flowchart LR or sequenceDiagram)');
    }
    if (/participant Caller[\s\S]*Caller->>Core: Invocation/m.test(diagramCode)) {
      errors.push('Mermaid diagram contains default placeholder sequence instead of an actual flow');
    }
  }

  // 5. Check Deep-Dive sections
  if (!/##\s*Problem and behavior/i.test(text)) {
    errors.push('Missing "## Problem and behavior" deep-dive section');
  }
  if (!/##\s*(?:Architecture and Call Trace|Architecture)/i.test(text)) {
    errors.push('Missing "## Architecture and Call Trace" section');
  }
  if (!/##\s*(?:Evidence & TDD Verification|Evidence)/i.test(text)) {
    errors.push('Missing "## Evidence & TDD Verification" section');
  }
  if (!/##\s*(?:Risks and manual review|Manual review)/i.test(text)) {
    errors.push('Missing "## Risks and manual review" section');
  } else {
    if (!/^\s*1\.\s+\S+/m.test(text)) {
      errors.push('Manual review must contain concrete numbered steps (1. ...)');
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

main(import.meta.url, async args => {
  const o = argumentsOf(args);
  let body = o.body;
  if (!body && o.file) {
    body = readFileSync(o.file, 'utf8');
  } else if (!body && o.pr) {
    const raw = execFileSync('gh', ['pr', 'view', String(o.pr), '--json', 'body'], { encoding: 'utf8' });
    body = JSON.parse(raw).body;
  } else if (!body && o._?.[0]) {
    body = o._[0];
  }
  if (!body) {
    throw new Error('Provide PR body text via --body, --file <path>, or --pr <number>');
  }
  const result = validatePrDescription(body);
  if (!result.ok) {
    console.error('PR description static validation failed:');
    for (const err of result.errors) {
      console.error(' - ' + err);
    }
  }
  return result;
});
