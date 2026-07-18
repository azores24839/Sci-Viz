---
name: case-hub-source-discovery
description: Discover and systematically de-duplicate candidate websites for any Case Hub source subject. Use when a worker asks an AI to find related websites, avoid missing separate portals or associated sites, or prepare a human-reviewed website list before collection. Do not use for crawling, collecting images, scheduling, or changing Case Hub data.
---

# Case Hub Source Discovery

Create a complete-as-practical candidate website list for one source subject. The worker reviews links in the conversation and decides which URLs to use later. Do not crawl, score, approve, schedule, or write any Case Hub data.

Use [the discovery protocol](references/source-discovery-protocol.md) for the full handover standard.

## Input

Collect only what is needed:

- Source subject name.
- Known websites, aliases, regions, or languages, if the worker provides them.

Do not require the worker to classify the subject type. Treat every subject as potentially having multiple related or independently hosted websites.

## Discovery workflow

1. Establish the source subject's names, aliases, and language variants from reliable public web evidence.
2. Search for its primary and separately hosted websites. Do not stop after finding one website.
3. Use several independent search routes: name variants, known URLs, associated names discovered during research, and outward links from candidate websites.
4. Repeat the search after the first candidate list. Stop only after a full additional pass finds no material new website.
5. Normalize and deduplicate root URLs. Retain separate websites even when their domains, branding, or hosting differ.
6. Return links for human review. Do not decide which links deserve collection.

## Output

Keep the default response short. Return only a Markdown list of candidate websites, grouped when the relationship is clear:

```md
# [Source subject]｜候选网站

## 核心网站
- [名称](URL)

## 关联主体或独立门户
- [名称](URL)

## 其他待查看网站
- [名称](URL)
```

Use `其他待查看网站` when the relationship is uncertain. Do not add source-scoring columns, ownership proofs, site maps, crawling advice, or collection actions unless the worker explicitly asks.

## Optional visual-content scan

Run this only after the worker supplies one or more selected URLs and asks for it. Inspect a representative sample and return one concise line per website:

```md
- [网站名称](URL)：抽样 N 个页面，平均约 N 张内容图片；主要媒介：……
```

Exclude interface icons, tracking assets, repeated branding, and duplicate thumbnails from image estimates. State sampling limits instead of claiming an exact whole-site image count when the evidence is incomplete.

## Boundaries

- Use available web research tools in the current environment; do not name or require a particular search provider.
- Do not narrow discovery to predefined site labels, domain patterns, countries, languages, or subject types.
- Do not infer that a website is irrelevant because it is not on the first domain found.
- Do not create crawl jobs, modify source records, or collect images.
- If web access is unavailable, say so plainly and ask the worker for known URLs or permission to continue in a web-capable environment.
