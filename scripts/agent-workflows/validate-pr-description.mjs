import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { main, argumentsOf, nonempty } from './common.mjs';

export function validateMermaid(diagram) {
  const errors = [];
  const text = String(diagram ?? '').trim();
  if (!text) {
    return { ok: false, errors: ['Mermaid diagram is empty'] };
  }

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const firstLine = lines[0] ?? '';
  const diagramTypeMatch = firstLine.match(/^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram)(?:\s+(TD|TB|LR|RL|BT))?/);

  if (!diagramTypeMatch) {
    errors.push(`Invalid Mermaid header: "${firstLine}". Expected flowchart, graph, sequenceDiagram, classDiagram, stateDiagram, or erDiagram.`);
    return { ok: false, errors };
  }

  const type = diagramTypeMatch[1];

  // 1. Check for illegal quote arrow syntax: -- "text" --> or -- "text" ---
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/--\s*"[^"]*"\s*-->/.test(line) || /--\s*"[^"]*"\s*---/.test(line)) {
      errors.push(`Line ${i + 1}: Invalid arrow label with quotes: '${line}'. In Mermaid, use standard pipe syntax '-->|label|' instead of '-- "label" -->'.`);
    }
  }

  // 2. Check for literal \n in labels (must use <br/> or <br>)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\\[nN]/.test(line)) {
      errors.push(`Line ${i + 1}: Mermaid does not support literal '\\n' inside node labels. Use '<br/>' for line breaks.`);
    }
  }

  // 3. Check for balanced brackets, braces, parentheses, and quotes
  let inDoubleQuote = false;
  let squareBracketDepth = 0;
  let parenDepth = 0;
  let curlyDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const prev = i > 0 ? text[i - 1] : '';

    if (char === '"' && prev !== '\\') {
      inDoubleQuote = !inDoubleQuote;
    } else if (!inDoubleQuote) {
      if (char === '[') squareBracketDepth++;
      else if (char === ']') squareBracketDepth--;
      else if (char === '(') parenDepth++;
      else if (char === ')') parenDepth--;
      else if (char === '{') curlyDepth++;
      else if (char === '}') curlyDepth--;

      if (squareBracketDepth < 0 || parenDepth < 0 || curlyDepth < 0) {
        errors.push(`Unbalanced bracket or parenthesis near character ${i} ('${char}')`);
        break;
      }
    }
  }

  if (inDoubleQuote) {
    errors.push('Unterminated double quote in Mermaid diagram.');
  }
  if (squareBracketDepth !== 0) {
    errors.push('Unbalanced square brackets `[` / `]` in Mermaid diagram.');
  }
  if (parenDepth !== 0) {
    errors.push('Unbalanced parentheses `(` / `)` in Mermaid diagram.');
  }
  if (curlyDepth !== 0) {
    errors.push('Unbalanced curly braces `{` / `}` in Mermaid diagram.');
  }

  // 4. Check for template placeholder
  if (/participant Caller[\s\S]*Caller->>Core: Invocation/m.test(text)) {
    errors.push('Mermaid diagram contains default placeholder sequence instead of an actual flow');
  }

  // 5. Flowchart specific checks
  if (type === 'flowchart' || type === 'graph') {
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^(?:subgraph|end|style|classDef|click|%%)\b/.test(line)) continue;
      // Single hyphen -> is invalid in flowchart (must be --> or ==> or -.->)
      if (/(?<!-)->(?![->])/.test(line)) {
        errors.push(`Line ${i + 1}: Invalid single-dash arrow '->' in flowchart: '${line}'. Use '-->' or '-->|label|'.`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function validatePrDescription(body) {
  const errors = [];
  const text = String(body ?? '').trim();
  if (!text) {
    return { ok: false, errors: ['PR description is empty'] };
  }

  // 1. Check for unreplaced template comments
  if (/<!--\s*(?:1-2 plain sentences|e\.g\.|Step \d|what broke|Describe the concrete|Punchline in bold)\b/i.test(text)) {
    errors.push('PR description contains unreplaced template comments (<!-- ... -->)');
  }

  // 2. Check 5-Second Quick Glance callout
  const hasNoteCallout = />\s*\[!NOTE\]/i.test(text);
  const hasQuickGlanceHeader = /###\s*⚡?\s*(?:5-Second\s+)?Quick Glance/i.test(text);
  if (!hasNoteCallout || !hasQuickGlanceHeader) {
    errors.push('Missing top-level "> [!NOTE] ### ⚡ 5-Second Quick Glance" callout');
  }

  // Check 🔴 Problem
  const problemMatch = text.match(/🔴\s*\*\*(?:PROBLEM|Problem|Trigger)[^*]*\*\*:?\s*(?:➔\s*)?([^\n\r]+)/i);
  if (!problemMatch || !problemMatch[1].replace(/<!--.*?-->/g, '').trim()) {
    errors.push('Quick Glance is missing non-empty "🔴 **PROBLEM / Trigger:**" summary');
  } else {
    // Check for bold contrast / punchline formatting (e.g. **Punchline:** or bold phrase)
    const content = problemMatch[1].trim();
    if (!/\*\*[^*]+\*\*/.test(content) && !/➔/.test(problemMatch[0])) {
      errors.push('Quick Glance Problem line must include high-contrast bold punchline (e.g. "🔴 **PROBLEM** ➔ **[Core issue in bold]:** details")');
    }
  }

  // Check 🟢 Fix / Solution
  const fixMatch = text.match(/🟢\s*\*\*(?:SOLUTION|Solution|Fix|Change)[^*]*\*\*:?\s*(?:➔\s*)?([^\n\r]+)/i);
  if (!fixMatch || !fixMatch[1].replace(/<!--.*?-->/g, '').trim()) {
    errors.push('Quick Glance is missing non-empty "🟢 **SOLUTION / Fix:**" summary');
  } else {
    const content = fixMatch[1].trim();
    if (!/\*\*[^*]+\*\*/.test(content) && !/➔/.test(fixMatch[0])) {
      errors.push('Quick Glance Solution line must include high-contrast bold punchline (e.g. "🟢 **SOLUTION** ➔ **[Key change in bold]:** details")');
    }
  }

  // Check 🛡️ Scope & Impact
  const impactMatch = text.match(/(?:🛡️|🛡)\s*\*\*(?:IMPACT|Impact|Scope)[^*]*\*\*:?\s*(?:➔\s*)?([^\n\r]+)/i);
  if (!impactMatch || !impactMatch[1].replace(/<!--.*?-->/g, '').trim()) {
    errors.push('Quick Glance is missing non-empty "🛡️ **IMPACT / Scope:**" summary');
  } else {
    const content = impactMatch[1].trim();
    if (!/\*\*[^*]+\*\*/.test(content) && !/➔/.test(impactMatch[0])) {
      errors.push('Quick Glance Impact line must include high-contrast bold punchline (e.g. "🛡️ **IMPACT** ➔ **[Risk level in bold]:** details")');
    }
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
    const mermaidResult = validateMermaid(diagramCode);
    if (!mermaidResult.ok) {
      errors.push(...mermaidResult.errors);
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
    body = o.file === '-' ? readFileSync(0, 'utf8') : readFileSync(o.file, 'utf8');
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
