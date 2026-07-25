# Inline Attachment Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make images embedded in a work item's Description, custom HTML fields, and comments actually load in the detail panel, by fetching them with the authenticated Azure DevOps client and inlining them as base64 data URIs — the same pattern already used for assignee/comment avatars.

**Architecture:** Extend the existing avatar auth-proxy pattern (`AzureDevOpsClient` fetches a URL with the Bearer token and returns a `data:` URI, `WorkItemDetailPanelManager` caches and resolves a `{url → dataUri}` map per panel, render functions substitute before injecting HTML into the webview). A new pure module (`inlineImages.ts`) handles URL extraction from raw HTML and `src` rewriting; everything else is wiring through the existing `WorkItemDetailPanelManager` → `renderWorkItemDetail` → `renderComment` pipeline.

**Tech Stack:** TypeScript, VS Code extension API, Vitest for unit tests. No new dependencies.

## Global Constraints

- No HTML parser dependency — extraction/rewriting stays regex-based, matching the existing `stripScriptTags` approach (spec: "Novo módulo `src/view/inlineImages.ts`").
- No CSP change — `img-src data: https:` already permits `data:` URIs (spec: "Fora do escopo").
- No lazy loading, no size/count limit — eager fetch with per-panel cache, same behavior as `resolveAvatars` today (spec: "Fora do escopo").
- Card compacto da lista (`renderWorkItemCard.ts`) and the Pull Request detail panel (`renderPullRequestDetail.ts`) are out of scope — no behavior change there (spec: "Fora do escopo").
- `organization` passed around is the short org name (e.g. `"myorg"`), the same value used to build `https://dev.azure.com/${organization}/...` in `client.ts` — not a full host string.

---

### Task 1: `inlineImages.ts` — URL extraction and `src` rewriting

**Files:**
- Create: `src/view/inlineImages.ts`
- Test: `src/view/inlineImages.test.ts`

**Interfaces:**
- Produces: `extractImageUrls(html: string, organization: string): string[]` — dedup'd list of `<img>` `src` URLs in `html` whose host is `dev.azure.com` or `${organization}.visualstudio.com`.
- Produces: `rewriteImageSrcs(html: string, images: Record<string, string | null>): string` — for each `<img src="URL">` in `html`: if `URL` is not a key of `images`, leave the tag unchanged; if `images[URL]` is a string, replace `URL` with it; if `images[URL]` is `null`, replace the whole tag with `<span class="kb-image-unavailable">🖼 imagem indisponível</span>`.

- [ ] **Step 1: Write the failing tests**

Create `src/view/inlineImages.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractImageUrls, rewriteImageSrcs } from './inlineImages';

describe('extractImageUrls', () => {
  it('extracts img src URLs hosted on dev.azure.com', () => {
    const html = '<p>before</p><img src="https://dev.azure.com/myorg/proj/_apis/wit/attachments/abc?fileName=x.png"><p>after</p>';
    expect(extractImageUrls(html, 'myorg')).toEqual([
      'https://dev.azure.com/myorg/proj/_apis/wit/attachments/abc?fileName=x.png',
    ]);
  });

  it('extracts img src URLs hosted on {organization}.visualstudio.com', () => {
    const html = '<img src="https://myorg.visualstudio.com/proj/_apis/wit/attachments/abc">';
    expect(extractImageUrls(html, 'myorg')).toEqual(['https://myorg.visualstudio.com/proj/_apis/wit/attachments/abc']);
  });

  it('ignores img src URLs hosted on other domains', () => {
    const html = '<img src="https://example.com/pic.png">';
    expect(extractImageUrls(html, 'myorg')).toEqual([]);
  });

  it('ignores a visualstudio.com host that belongs to a different org', () => {
    const html = '<img src="https://otherorg.visualstudio.com/proj/_apis/wit/attachments/abc">';
    expect(extractImageUrls(html, 'myorg')).toEqual([]);
  });

  it('dedupes repeated URLs', () => {
    const url = 'https://dev.azure.com/myorg/proj/_apis/wit/attachments/abc';
    const html = `<img src="${url}"><p>text</p><img src="${url}">`;
    expect(extractImageUrls(html, 'myorg')).toEqual([url]);
  });

  it('returns an empty array when there are no img tags', () => {
    expect(extractImageUrls('<p>no images here</p>', 'myorg')).toEqual([]);
  });

  it('ignores an img tag with an unparseable src', () => {
    const html = '<img src="not a url">';
    expect(extractImageUrls(html, 'myorg')).toEqual([]);
  });
});

describe('rewriteImageSrcs', () => {
  const url = 'https://dev.azure.com/myorg/proj/_apis/wit/attachments/abc';

  it('replaces the src with the resolved data URI', () => {
    const html = `<p>before</p><img src="${url}" alt="x"><p>after</p>`;
    const result = rewriteImageSrcs(html, { [url]: 'data:image/png;base64,ABC' });
    expect(result).toBe('<p>before</p><img src="data:image/png;base64,ABC" alt="x"><p>after</p>');
  });

  it('replaces the tag with a placeholder when resolution failed (null)', () => {
    const html = `<img src="${url}">`;
    const result = rewriteImageSrcs(html, { [url]: null });
    expect(result).toBe('<span class="kb-image-unavailable">🖼 imagem indisponível</span>');
  });

  it('leaves the tag unchanged when the URL is not in the images map', () => {
    const html = '<img src="https://example.com/pic.png">';
    const result = rewriteImageSrcs(html, {});
    expect(result).toBe(html);
  });

  it('leaves html with no img tags unchanged', () => {
    const html = '<p>just text</p>';
    expect(rewriteImageSrcs(html, {})).toBe(html);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/view/inlineImages.test.ts`
Expected: FAIL — `Cannot find module './inlineImages'` (file does not exist yet).

- [ ] **Step 3: Implement `inlineImages.ts`**

```ts
const IMG_SRC_RE = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

// `organization` is the short org name (e.g. "myorg"), the same value used to build
// `https://dev.azure.com/${organization}/...` in client.ts — not a full host string.
function isAdoHostedUrl(url: string, organization: string): boolean {
  try {
    const host = new URL(url).host;
    return host === 'dev.azure.com' || host === `${organization}.visualstudio.com`;
  } catch {
    return false;
  }
}

export function extractImageUrls(html: string, organization: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(IMG_SRC_RE)) {
    const url = match[1];
    if (isAdoHostedUrl(url, organization)) {
      urls.add(url);
    }
  }
  return [...urls];
}

export function rewriteImageSrcs(html: string, images: Record<string, string | null>): string {
  return html.replace(IMG_SRC_RE, (tag, url) => {
    if (!(url in images)) {
      return tag;
    }
    const dataUri = images[url];
    if (!dataUri) {
      return '<span class="kb-image-unavailable">🖼 imagem indisponível</span>';
    }
    return tag.replace(url, dataUri);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/view/inlineImages.test.ts`
Expected: PASS (all 11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/view/inlineImages.ts src/view/inlineImages.test.ts
git commit -m "feat: add inline image URL extraction and src rewriting"
```

---

### Task 2: Generalize `getAvatarDataUri` to `getAuthenticatedImageDataUri`

**Files:**
- Modify: `src/azureDevOps/client.ts` (method around line 150)
- Modify: `src/azureDevOps/client.test.ts` (describe block + calls around lines 223–256)
- Modify: `src/view/PullRequestDetailPanelManager.ts` (call site around line 136)
- Modify: `src/view/KanbrainViewProvider.ts` (call site around line 226)
- Modify: `src/view/WorkItemDetailPanelManager.ts` (call site around line 149)

**Interfaces:**
- Produces: `AzureDevOpsClient.getAuthenticatedImageDataUri(url: string): Promise<string | null>` — same behavior as the old `getAvatarDataUri` (fetch with the Bearer token, return a `data:<content-type>;base64,<bytes>` URI, or `null` on any failure). Task 3 and Task 4 call this method by its new name.

- [ ] **Step 1: Rename the method in `client.ts`**

In `src/azureDevOps/client.ts`, rename:

```ts
async getAvatarDataUri(url: string): Promise<string | null> {
```

to:

```ts
async getAuthenticatedImageDataUri(url: string): Promise<string | null> {
```

(Body is unchanged — same `fetchWithAuth`/base64 logic.)

- [ ] **Step 2: Update `client.test.ts` to use the new name**

In `src/azureDevOps/client.test.ts`, rename the `describe` block and all three `client.getAvatarDataUri(...)` calls (lines 223, 229, 243, 252) to `client.getAuthenticatedImageDataUri(...)` / `describe('AzureDevOpsClient.getAuthenticatedImageDataUri', ...)`. No other change — same assertions.

- [ ] **Step 3: Run the client test suite to verify it fails, then compiles clean after the rename**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected at this point: FAIL — the three call sites in `src/view/*.ts` still reference `getAvatarDataUri`, so `npm run compile` (run in the next step) will fail; the vitest run itself may still pass since `client.test.ts` and `client.ts` are already consistent. Proceed to Step 4 regardless.

- [ ] **Step 4: Update the three call sites**

`src/view/PullRequestDetailPanelManager.ts:136`:
```ts
this.avatarCache.set(url, await this.client.getAuthenticatedImageDataUri(url));
```

`src/view/KanbrainViewProvider.ts:226`:
```ts
this.avatarCache.set(url, this.client ? await this.client.getAuthenticatedImageDataUri(url) : null);
```

`src/view/WorkItemDetailPanelManager.ts:149`:
```ts
this.avatarCache.set(url, await this.client.getAuthenticatedImageDataUri(url));
```

- [ ] **Step 5: Compile and run the full test suite**

Run: `npm run compile && npx vitest run`
Expected: both PASS — no remaining references to `getAvatarDataUri` anywhere (verify with a search if either command fails on an unresolved reference).

- [ ] **Step 6: Commit**

```bash
git add src/azureDevOps/client.ts src/azureDevOps/client.test.ts src/view/PullRequestDetailPanelManager.ts src/view/KanbrainViewProvider.ts src/view/WorkItemDetailPanelManager.ts
git commit -m "refactor: generalize getAvatarDataUri to getAuthenticatedImageDataUri"
```

---

### Task 3: Wire `inlineImages` through `renderComment` and `renderWorkItemDetail`

**Files:**
- Modify: `src/view/renderComment.ts`
- Modify: `src/view/renderWorkItemDetail.ts`
- Modify: `src/view/renderWorkItemDetail.test.ts`
- Modify: `src/view/detailPanelCss.ts`

**Interfaces:**
- Consumes: `rewriteImageSrcs(html: string, images: Record<string, string | null>): string` from Task 1 (`src/view/inlineImages.ts`).
- Produces: `renderComment(comment: WorkItemComment, avatars: Record<string, string>, inlineImages?: Record<string, string | null>): string` — third parameter defaults to `{}` so existing callers (`renderPullRequestDetail.ts`, which passes PR comments with `<`/`>` already HTML-escaped) keep compiling and behaving identically without modification.
- Produces: `WorkItemDetailInput.inlineImages: Record<string, string | null>` — required field, consumed by `renderWorkItemDetail`. Task 4's `WorkItemDetailPanelManager` supplies this field.

- [ ] **Step 1: Write the failing tests**

Add to `src/view/renderWorkItemDetail.test.ts` (extend the `input()` helper's default and add new `it` blocks; existing tests keep passing since `inlineImages: {}` is a safe default):

```ts
// In the `input()` helper defaults, add:
//   inlineImages: {},

it('resolves an inline image in the description to its data URI', () => {
  const url = 'https://dev.azure.com/org/proj/_apis/wit/attachments/abc';
  const html = renderWorkItemDetail(
    input({ description: `<p>See:</p><img src="${url}">`, inlineImages: { [url]: 'data:image/png;base64,ABC' } }),
  );
  expect(html).toContain('<img src="data:image/png;base64,ABC">');
});

it('shows a placeholder when an inline description image failed to resolve', () => {
  const url = 'https://dev.azure.com/org/proj/_apis/wit/attachments/abc';
  const html = renderWorkItemDetail(input({ description: `<img src="${url}">`, inlineImages: { [url]: null } }));
  expect(html).toContain('kb-image-unavailable');
  expect(html).not.toContain(`src="${url}"`);
});

it('leaves an external (non-ADO) image in the description untouched', () => {
  const html = renderWorkItemDetail(
    input({ description: '<img src="https://example.com/pic.png">', inlineImages: {} }),
  );
  expect(html).toContain('<img src="https://example.com/pic.png">');
});

it('resolves an inline image in an extra HTML section', () => {
  const url = 'https://dev.azure.com/org/proj/_apis/wit/attachments/xyz';
  const html = renderWorkItemDetail(
    input({
      htmlSections: [{ refName: 'Microsoft.VSTS.TCM.ReproSteps', label: 'Repro Steps', value: `<img src="${url}">` }],
      inlineImages: { [url]: 'data:image/png;base64,XYZ' },
    }),
  );
  expect(html).toContain('<img src="data:image/png;base64,XYZ">');
});

it('resolves an inline image in a comment body', () => {
  const url = 'https://dev.azure.com/org/proj/_apis/wit/attachments/qrs';
  const comments: WorkItemComment[] = [
    { id: 1, text: `<img src="${url}">`, createdBy: { displayName: 'Jane', imageUrl: null }, createdDate: '2026-01-01T00:00:00Z' },
  ];
  const html = renderWorkItemDetail(input({ comments, inlineImages: { [url]: 'data:image/png;base64,QRS' } }));
  expect(html).toContain('<img src="data:image/png;base64,QRS">');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/view/renderWorkItemDetail.test.ts`
Expected: FAIL — TypeScript error (`inlineImages` missing from `WorkItemDetailInput`/`input()`) or, if TS is loose enough to run, assertion failures because the images are not yet being rewritten.

- [ ] **Step 3: Update `renderComment.ts`**

```ts
import type { WorkItemComment } from '../azureDevOps/workItemDetail';
import { escapeHtml } from './escapeHtml';
import { renderAvatarOrInitial } from './renderAssignee';
import { rewriteImageSrcs } from './inlineImages';

function stripScriptTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '');
}

export function renderComment(
  comment: WorkItemComment,
  avatars: Record<string, string>,
  inlineImages: Record<string, string | null> = {},
): string {
  const avatarHtml = renderAvatarOrInitial(comment.createdBy.displayName, comment.createdBy.imageUrl, avatars);
  const date = new Date(comment.createdDate);
  const dateLabel = Number.isNaN(date.getTime()) ? comment.createdDate : date.toLocaleString();
  return `
    <div class="kb-comment">
      <div class="kb-comment-header">
        ${avatarHtml}
        <span class="kb-comment-author">${escapeHtml(comment.createdBy.displayName)}</span>
        <span class="kb-comment-date">${escapeHtml(dateLabel)}</span>
      </div>
      <div class="kb-comment-body">${rewriteImageSrcs(stripScriptTags(comment.text), inlineImages)}</div>
    </div>
  `;
}
```

- [ ] **Step 4: Update `renderWorkItemDetail.ts`**

Add the import:

```ts
import { rewriteImageSrcs } from './inlineImages';
```

Add `inlineImages` to the input interface:

```ts
export interface WorkItemDetailInput {
  workItem: WorkItem;
  config: KanbrainConfig;
  description: string | null;
  groups: DetailGroup[];
  htmlSections: DetailField[];
  comments: WorkItemComment[];
  avatars: Record<string, string>;
  inlineImages: Record<string, string | null>;
  prDetails: Record<string, PullRequestDetails>;
  parent: WorkItem | null;
  children: WorkItem[];
}
```

Update `renderHtmlSection` to take the images map and rewrite:

```ts
function renderHtmlSection(field: DetailField, inlineImages: Record<string, string | null>): string {
  const value = typeof field.value === 'string' ? rewriteImageSrcs(stripScriptTags(field.value), inlineImages) : '';
  return `
    <div class="kb-detail-html-section">
      <div class="kb-detail-section-label">${escapeHtml(field.label)}</div>
      <div class="kb-detail-html-body">${value}</div>
    </div>
  `;
}
```

In `renderWorkItemDetail`, destructure `inlineImages` from `input` and thread it through:

```ts
const { workItem, config, description, groups, htmlSections, comments, avatars, inlineImages, prDetails, parent, children } = input;
```

```ts
const descriptionHtml = description
  ? `<div class="kb-detail-html-section"><div class="kb-detail-section-label">Description</div><div class="kb-detail-html-body">${rewriteImageSrcs(stripScriptTags(description), inlineImages)}</div></div>`
  : '';

const commentsHtml = comments.length
  ? comments.map(c => renderComment(c, avatars, inlineImages)).join('')
  : '<div class="kb-empty">No comments.</div>';
```

```ts
${htmlSections.map(f => renderHtmlSection(f, inlineImages)).join('')}
```

- [ ] **Step 5: Add CSS for the unavailable-image placeholder**

In `src/view/detailPanelCss.ts`, add after the existing `.kb-detail-html-body img { max-width: 100%; }` line:

```ts
    .kb-comment-body img { max-width: 100%; }
    .kb-image-unavailable { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border: 1px dashed var(--vscode-panel-border); border-radius: 4px; font-size: 12px; opacity: 0.7; }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run compile && npx vitest run src/view/renderWorkItemDetail.test.ts`
Expected: PASS (all existing tests still pass with `inlineImages: {}` default, plus the 5 new tests).

- [ ] **Step 7: Run the full test suite to confirm no regressions**

Run: `npm run compile && npx vitest run`
Expected: PASS (in particular `renderPullRequestDetail.test.ts`, which calls `renderComment` with two arguments — must still pass unchanged since the third parameter defaults to `{}`).

- [ ] **Step 8: Commit**

```bash
git add src/view/renderComment.ts src/view/renderWorkItemDetail.ts src/view/renderWorkItemDetail.test.ts src/view/detailPanelCss.ts
git commit -m "feat: rewrite inline attachment image srcs in description, html sections, and comments"
```

---

### Task 4: Resolve inline images in `WorkItemDetailPanelManager`

**Files:**
- Modify: `src/view/WorkItemDetailPanelManager.ts`

**Interfaces:**
- Consumes: `extractImageUrls(html: string, organization: string): string[]` from Task 1.
- Consumes: `AzureDevOpsClient.getAuthenticatedImageDataUri(url: string): Promise<string | null>` from Task 2.
- Consumes: `WorkItemDetailInput.inlineImages: Record<string, string | null>` from Task 3.
- Produces: `WorkItemDetailPanelManager.resolveInlineImages(description: string | null, htmlSections: DetailField[], comments: WorkItemComment[], organization: string): Promise<Record<string, string | null>>` — private method, no external consumers beyond this file.

This task has no dedicated unit test — same precedent as `resolveAvatars`/`resolvePullRequestDetails`, which are also untested directly (per the design spec's Testes section: "Sem teste dedicado para `resolveInlineImages`... verificado via `npm run compile` + suíte completa + validação manual (F5)"). Verification is compile + full suite + a manual smoke test.

- [ ] **Step 1: Add the import and cache field**

Add `DetailField` to the import from `../azureDevOps/workItemDetail`:

```ts
import type { WorkItemComment, WorkItemTypeLayout, DetailField } from '../azureDevOps/workItemDetail';
```

Add the import for `extractImageUrls`:

```ts
import { extractImageUrls } from './inlineImages';
```

Add the cache field next to `avatarCache`:

```ts
private inlineImageCache = new Map<string, string | null>();
```

- [ ] **Step 2: Add `resolveInlineImages`**

Add this private method next to `resolveAvatars`:

```ts
private async resolveInlineImages(
  description: string | null,
  htmlSections: DetailField[],
  comments: WorkItemComment[],
  organization: string,
): Promise<Record<string, string | null>> {
  const htmlBlobs = [description ?? '', ...htmlSections.map(f => String(f.value ?? '')), ...comments.map(c => c.text)];
  const urls = [...new Set(htmlBlobs.flatMap(html => extractImageUrls(html, organization)))];

  const uncached = urls.filter(u => !this.inlineImageCache.has(u));
  await Promise.all(
    uncached.map(async url => {
      this.inlineImageCache.set(url, await this.client.getAuthenticatedImageDataUri(url));
    }),
  );

  const resolved: Record<string, string | null> = {};
  for (const url of urls) {
    resolved[url] = this.inlineImageCache.get(url) ?? null;
  }
  return resolved;
}
```

- [ ] **Step 3: Hoist `resolveDetailFields` above the `Promise.all` in `loadAndRender` and wire `inlineImages` in**

In `loadAndRender`, find the existing block:

```ts
    const [avatars, prDetails] = await Promise.all([
      this.resolveAvatars(workItem, comments),
      this.resolvePullRequestDetails(workItem, config),
    ]);

    const stateKey = JSON.stringify({ workItem, rawFields, comments, parent, children, avatars, prDetails, repositories: config.repositories });
    if (this.lastStateByPanel.get(id) === stateKey) {
      return;
    }
    this.lastStateByPanel.set(id, stateKey);

    const { groups, htmlSections } = resolveDetailFields(layout, rawFields);
    panel.title = `#${workItem.id} ${workItem.title}`;
    panel.webview.html = this.wrapHtml(
      renderWorkItemDetail({
        workItem,
        config,
        description: typeof rawFields['System.Description'] === 'string' ? (rawFields['System.Description'] as string) : null,
        groups,
        htmlSections,
        comments,
        avatars,
        prDetails,
        parent,
        children,
      }),
    );
```

Replace it with:

```ts
    const { groups, htmlSections } = resolveDetailFields(layout, rawFields);
    const description = typeof rawFields['System.Description'] === 'string' ? (rawFields['System.Description'] as string) : null;

    const [avatars, prDetails, inlineImages] = await Promise.all([
      this.resolveAvatars(workItem, comments),
      this.resolvePullRequestDetails(workItem, config),
      this.resolveInlineImages(description, htmlSections, comments, config.organization),
    ]);

    const stateKey = JSON.stringify({ workItem, rawFields, comments, parent, children, avatars, prDetails, inlineImages, repositories: config.repositories });
    if (this.lastStateByPanel.get(id) === stateKey) {
      return;
    }
    this.lastStateByPanel.set(id, stateKey);

    panel.title = `#${workItem.id} ${workItem.title}`;
    panel.webview.html = this.wrapHtml(
      renderWorkItemDetail({
        workItem,
        config,
        description,
        groups,
        htmlSections,
        comments,
        avatars,
        inlineImages,
        prDetails,
        parent,
        children,
      }),
    );
```

- [ ] **Step 4: Compile and run the full test suite**

Run: `npm run compile && npx vitest run`
Expected: PASS — no test asserts on `WorkItemDetailPanelManager` internals directly, so this step is a regression check on everything built in Tasks 1–3.

- [ ] **Step 5: Manual smoke test**

Press F5 to launch the Extension Development Host. Open a work item whose Description or a comment contains a pasted screenshot (or paste one into a test work item in your Azure DevOps org via the browser, then open that work item's detail panel in Kanbrain). Confirm:
- The image renders inline (not a broken-image icon).
- Reopening the same panel a second time is fast (cache hit — no visible delay).
- A work item with no images still renders normally.

- [ ] **Step 6: Commit**

```bash
git add src/view/WorkItemDetailPanelManager.ts
git commit -m "feat: resolve and cache inline attachment images per detail panel"
```

---

## Self-Review Notes

- **Spec coverage:** "Dentro do escopo" (detail panel Description/htmlSections/comments, generalized auth fetch, per-panel cache, unavailable-image fallback) — Tasks 1–4. "Tratamento de erros" (null → placeholder, non-ADO URLs untouched, no new failure mode for the panel refresh) — covered by `rewriteImageSrcs`'s branching (Task 1) and `resolveInlineImages` never throwing (Task 4, same shape as `resolveAvatars`). "Testes" section of the spec — each listed test file has a corresponding task (`inlineImages.test.ts` in Task 1, `renderWorkItemDetail.test.ts` in Task 3, `client.test.ts` rename in Task 2, `resolveInlineImages` explicitly left untested with the same justification the spec gives).
- **Type consistency:** `Record<string, string | null>` is used consistently for `inlineImages` across `inlineImages.ts`, `renderComment.ts`, `renderWorkItemDetail.ts`, and `WorkItemDetailPanelManager.ts`. `getAuthenticatedImageDataUri` name matches across Task 2 (definition) and Task 4 (call site).
