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

export function extractVisualEvidence(text) {
  const clean = String(text ?? '').replace(/<!--[\s\S]*?-->/g, '');
  const markdownImgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const htmlImgRegex = /<img\s+[^>]*src=["']([^"']+)["']/gi;
  const matches = [];
  let m;
  while ((m = markdownImgRegex.exec(clean)) !== null) {
    const alt = m[1].trim();
    const url = m[2].trim();
    if (url && !/^(?:\(prior\)|placeholder|none|n\/a|\s*)$/i.test(url)) {
      matches.push({ alt, url });
    }
  }
  while ((m = htmlImgRegex.exec(clean)) !== null) {
    const url = m[1].trim();
    if (url && !/^(?:\(prior\)|placeholder|none|n\/a|\s*)$/i.test(url)) {
      matches.push({ alt: '', url });
    }
  }
  return matches;
}

export function validatePrDescription(body, options = {}) {
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
  if (!hasNoteCallout) {
    errors.push('Missing top-level "> [!NOTE]" 5-Second Quick Glance callout');
  }

  // Check 🔴 Problem
  const problemMatch = text.match(/🔴\s*\*\*(?:PROBLEM|Problem|Trigger|ПРОБЛЕМА|Проблема)[^*]*\*\*:?\s*(?:➔\s*)?([^\n\r]+)/i);
  if (!problemMatch || !problemMatch[1].replace(/<!--.*?-->/g, '').trim()) {
    errors.push('Quick Glance is missing non-empty "🔴 **PROBLEM / ПРОБЛЕМА:**" summary');
  } else {
    const content = problemMatch[1].trim();
    if (!/\*\*[^*]+\*\*/.test(content) && !/➔/.test(problemMatch[0])) {
      errors.push('Quick Glance Problem line must include high-contrast bold punchline (e.g. "🔴 **PROBLEM** ➔ **[Core issue in bold]:** details")');
    }
  }

  // Check 🟢 Fix / Solution
  const fixMatch = text.match(/🟢\s*\*\*(?:SOLUTION|Solution|Fix|Change|РЕШЕНИЕ|Решение)[^*]*\*\*:?\s*(?:➔\s*)?([^\n\r]+)/i);
  if (!fixMatch || !fixMatch[1].replace(/<!--.*?-->/g, '').trim()) {
    errors.push('Quick Glance is missing non-empty "🟢 **SOLUTION / РЕШЕНИЕ:**" summary');
  } else {
    const content = fixMatch[1].trim();
    if (!/\*\*[^*]+\*\*/.test(content) && !/➔/.test(fixMatch[0])) {
      errors.push('Quick Glance Solution line must include high-contrast bold punchline (e.g. "🟢 **SOLUTION** ➔ **[Key change in bold]:** details")');
    }
  }

  // Check 🛡️ Scope & Impact
  const impactMatch = text.match(/(?:🛡️|🛡)\s*\*\*(?:IMPACT|Impact|Scope|Risk|ВЛИЯНИЕ|Влияние|РИСК|Риск)[^*]*\*\*:?\s*(?:➔\s*)?([^\n\r]+)/i);
  if (!impactMatch || !impactMatch[1].replace(/<!--.*?-->/g, '').trim()) {
    errors.push('Quick Glance is missing non-empty "🛡️ **IMPACT / РИСК:**" summary');
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

  // Determine scope: frontend vs backend
  let isFrontend = options.frontend === true || options.frontend === 'true' || options.scope === 'frontend';
  let isBackend = options.backend === true || options.backend === 'true' || options.scope === 'backend';

  if (!isFrontend && !isBackend) {
    if (options.scope === 'fullstack') {
      isFrontend = true;
      isBackend = true;
    } else {
      // Auto-detect from table / text if table rows explicitly reference frontend or backend
      const tableMatch = text.match(/\|[^\n]+\|[^\n]+\|\s*\n\s*\|(?:\s*:?-+:?\s*\|)+\s*\n([\s\S]*?)(?:\n\s*\n|---|\n##)/m);
      const tableRows = tableMatch ? tableMatch[1] : '';
      const hasFrontendRef = /\b(?:frontend|ui|components?|styles?|css|modal|dialog|button|page|view)\b/i.test(tableRows);
      const hasBackendRef = /\b(?:backend|api|server|database|db|migration|redis|postgres|pipeline|docker)\b/i.test(tableRows);

      if (hasFrontendRef && !hasBackendRef) {
        isFrontend = true;
      } else if (hasBackendRef && !hasFrontendRef) {
        isBackend = true;
      } else if (hasFrontendRef && hasBackendRef) {
        isFrontend = true;
        isBackend = true;
      }
    }
  }

  // 4. Validate Mermaid diagram and Visual Evidence
  const mermaidMatch = text.match(/```mermaid\s*\n([\s\S]*?)\n```/);
  if (mermaidMatch) {
    const diagramCode = mermaidMatch[1].trim();
    const mermaidResult = validateMermaid(diagramCode);
    if (!mermaidResult.ok) {
      errors.push(...mermaidResult.errors);
    }
  }

  const screenshots = extractVisualEvidence(text);

  if (isFrontend && !isBackend) {
    // Pure frontend: visual screenshot evidence is mandatory; Mermaid is optional!
    if (screenshots.length === 0) {
      errors.push('Frontend PR requires real visual screenshot evidence: embed image links (![alt](url) or <img>) showing before/after behavior');
    }
  } else if (isBackend && !isFrontend) {
    // Pure backend: Mermaid diagram is mandatory; visual screenshot evidence is optional
    if (!mermaidMatch) {
      errors.push('Backend PR requires an architecture visual diagram (```mermaid ... ```)');
    }
  } else if (isFrontend && isBackend) {
    // Fullstack: both are required!
    if (!mermaidMatch) {
      errors.push('Fullstack PR requires an architecture visual diagram (```mermaid ... ```)');
    }
    if (screenshots.length === 0) {
      errors.push('Fullstack PR requires visual screenshot evidence for frontend changes: embed image links (![alt](url) or <img>)');
    }
  } else {
    // Unspecified scope: require at least one (Mermaid diagram OR visual screenshot evidence)
    if (!mermaidMatch && screenshots.length === 0) {
      errors.push('Missing visual evidence: PR must include either a Mermaid diagram (```mermaid ... ```) for backend/logic, or visual screenshot evidence (![alt](url)) for frontend');
    }
  }

  // 5. Check Deep-Dive sections (supporting both standard and simplified bilingual headers)
  if (!/##\s*(?:\d+\.\s*)?(?:Problem and behavior|Problem|Описание проблемы|Описание)/i.test(text)) {
    errors.push('Missing "## Problem and behavior" deep-dive section');
  }
  if (!/##\s*(?:\d+\.\s*)?(?:Architecture and Call Trace|Architecture|Visual Evidence|Visual Evidence & Architecture|Архитектура)/i.test(text)) {
    errors.push('Missing "## Architecture and Call Trace" or "## Visual Evidence" section');
  }
  if (!/##\s*(?:\d+\.\s*)?(?:Evidence & TDD Verification|Evidence|Verification & TDD|Verification|Верификация|Тестирование)/i.test(text)) {
    errors.push('Missing "## Evidence & TDD Verification" section');
  }
  if (!/##\s*(?:\d+\.\s*)?(?:Risks and manual review|Manual review|Risks|Ручная проверка)/i.test(text)) {
    errors.push('Missing "## Risks and manual review" section');
  } else {
    if (!/^\s*1\.\s+\S+/m.test(text)) {
      errors.push('Manual review must contain concrete numbered steps (1. ...)');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    scope: isFrontend && isBackend ? 'fullstack' : isFrontend ? 'frontend' : isBackend ? 'backend' : 'general'
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
  const result = validatePrDescription(body, {
    frontend: o.frontend,
    backend: o.backend,
    scope: o.scope
  });
  if (!result.ok) {
    console.error('PR description static validation failed:');
    for (const err of result.errors) {
      console.error(' - ' + err);
    }
  }
  return result;
});
