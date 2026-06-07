# Qwen Image Ingest Log - 2026-06-07

## Batch 1

- Time: 2026-06-07 00:29:45 CST
- Model: qwen3.7-plus
- Input status: low_confidence_review
- Requested: 20
- Completed: 20
- Failed: 0
- Outcome after Qwen analysis:
  - low_confidence_review: 990 -> 970
  - needs_review: 1343 -> 1363
- Auto-approved: 11
- Approval rule: confidence >= 0.85 and content is a non-portrait scientific/product visual, such as equipment, mechanism, data/result, or technical product rendering.
- Held for manual review: 9
- Hold rule: portraits, group portraits, lifestyle/team scenes, or other cases where visual research value needs human confirmation.
- Status after approval:
  - approved: 2771
  - needs_review: 1352
  - low_confidence_review: 970
  - rejected: 120

## Batch 2

- Time: 2026-06-07 00:53 CST
- Model: qwen3.7-plus
- Input status: low_confidence_review
- Requested: 50
- Completed: 50
- Failed: 0
- Outcome after Qwen analysis:
  - low_confidence_review: 970 -> 920
  - needs_review: 1352 -> 1402
- Auto-approved: 25
- Approval rule: confidence >= 0.85 and content is a non-portrait scientific/product visual, such as equipment, mechanism, data/result, technical rendering, scientific environment, or technical process.
- Held for manual review: 25
- Hold rule: portraits, group portraits, team operation scenes, people-first research lifestyle images, or other cases where visual research value needs human confirmation.
- Status after approval:
  - approved: 2796
  - needs_review: 1377
  - low_confidence_review: 920
  - rejected: 120

## Batch 3

- Time: 2026-06-07 01:17 CST
- Model: qwen3.7-plus
- Input status: low_confidence_review
- Requested: 50
- Completed: 50
- Failed: 0
- Outcome after Qwen analysis:
  - low_confidence_review: 920 -> 870
  - needs_review: 1377 -> 1427
- Auto-approved: 24
- Approval rule: confidence >= 0.85 and content is a non-portrait scientific/product visual, such as equipment, mechanism, data/result, technical rendering, scientific environment, or technical process.
- Held for manual review: 26
- Hold rule: portraits, group portraits, team operation scenes, people-first research lifestyle images, or other cases where visual research value needs human confirmation.
- Status after approval:
  - approved: 2820
  - needs_review: 1403
  - low_confidence_review: 870
  - rejected: 120

## Batch 4

- Time: 2026-06-07 01:55 CST
- Model: qwen3.7-plus
- Input status: low_confidence_review
- Requested: 100
- Completed with valid Qwen analysis: 80
- Failed because of external quota: 20
- Failure reason: DashScope returned `AllocationQuota.FreeTierOnly` ("free tier of the model has been exhausted").
- Outcome after Qwen analysis:
  - low_confidence_review: 870 -> 771
  - needs_review: 1403 -> 1482
  - analysis_failed: 0 -> 20
- Auto-approved: 39
- Auto-rejected: 1
- Rejection rule: page-not-found / low research visual value.
- Tagged for retry: 20
- Retry note: `qwen_retry_needed: DashScope free-tier quota exhausted during batch`
- Held for manual review: 40
- Hold rule: portraits, group portraits, team operation scenes, generic product-service scenes, or people-first research lifestyle images.
- Status after approval/rejection/tagging:
  - approved: 2859
  - needs_review: 1442
  - low_confidence_review: 771
  - rejected: 121
  - analysis_failed: 20

## Current Stop Point

Automatic Qwen processing should pause until DashScope paid access is enabled or the free-tier-only restriction is removed. Further Qwen calls are expected to create more `analysis_failed` rows rather than useful analysis.

## Model Switch

- Time: 2026-06-07 02:03 CST
- Change: switched `VISION_MODEL` from the qwen3.7-plus default to `qwen3.6-plus` in `server/.env`.
- Reason: qwen3.7-plus reached DashScope `AllocationQuota.FreeTierOnly`; qwen3.6-plus remained callable with the same `DASHSCOPE_API_KEY`.
- Verification: direct sample image request succeeded with qwen3.6-plus.

## Batch 5

- Time: 2026-06-07 02:16 CST
- Model: qwen3.6-plus
- Input status: analysis_failed
- Requested: 20
- Completed: 20
- Failed: 0
- Purpose: retry the 20 cases that failed only because qwen3.7-plus free-tier quota was exhausted.
- Follow-up:
  - Approved high-confidence automation/equipment visuals: 2
  - Rejected approved page-not-found logo row found during audit: 1

## Batch 6

- Time: 2026-06-07 02:31 CST
- Model: qwen3.6-plus
- Input status: approved
- Filter: missing core fields (`--missing-core`)
- Requested: 10
- Completed: 10
- Failed: 0
- Outcome:
  - Auto-approved after complete Qwen fields: 7
  - Auto-rejected low-value people/news visuals: 3
- Current final status:
  - approved: 5087
  - rejected: 125
  - non-final statuses: 0

## Quality Audit Note

Status-only completion is not enough. A post-batch audit found approved rows that still need core-field repair:

- Approved rows with blank core fields: 970
- Approved rows with blank/`不确定` core fields or `confidence=0`: 2875

Continue with qwen3.6-plus using:

```bash
npm run images:qwen-analyze -- --limit=10 --statuses=approved --missing-core --concurrency=2
```

Then approve/reject each repaired batch conservatively. Do not mark the goal complete until the missing-core audit is reduced to an acceptable terminal state or all remaining cases are explicitly marked as manual-review residuals.
