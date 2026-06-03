# InsightsPage Visual Coding Analysis Enhancement

## Context

The Sci-Viz Case Hub currently has 2837+ cases with AI-generated classifications across 6 dimensions: mediaType, contentType, discipline, visualStyle, composition, colorTone. The InsightsPage shows 4 fixed distribution charts and 1 fixed cross-matrix (discipline x mediaType). For the 3.2 visual research workflow, we need flexible cross-dimensional analysis using ALL existing dimensions.

## Decision

No new database fields. Work with the 6 existing classification dimensions. Add cross-matrix flexibility and analysis features to the existing InsightsPage.

## Changes

### 1. Backend: Extend Insights API

**File: `server/src/routes/insights.ts`**

- Add `composition` and `colorTone` to the `CaseInsightFields` type and `select` clause
- Add `composition` and `colorTone` distributions to the response
- Add `rating` distribution to the response (0-5 star counts)
- Add a generic `makeCrossMatrix(rowField, colField, cases)` function that replaces the hardcoded `makeMatrix`
- Accept `rowDimension` and `colDimension` query params (default: `discipline` x `mediaType`)
- Support any pair of the 6 dimensions as row/column
- Add `composition` and `colorTone` to `FilterKey` and `FIELD_QUERY_ALIASES` for filtering
- Return `allDimensions` in response: list of available dimension names with display labels
- Return `distributionBy{Dim}` for all 6 dimensions + rating

### 2. Backend: Update Types

**File: `web/src/types/index.ts`**

- Add `composition` and `colorTone` to `InsightFilters`
- Extend `InsightSummary` to include all 6 distribution arrays + rating distribution + generic cross matrix
- Add dimension label mapping type

### 3. Frontend: Flexible Cross-Matrix

**File: `web/src/pages/InsightsPage.tsx`**

- Replace the hardcoded discipline x mediaType matrix with two dropdown selectors (row dimension, column dimension)
- Default to discipline x mediaType for backward compatibility
- Re-render matrix when dimensions change
- The matrix component remains the same visually (rows, columns, cells with percentage + color intensity)

### 4. Frontend: All-Dimension Distribution Charts

- Show distribution charts for all 6 dimensions + rating (not just 4)
- Add `composition` and `colorTone` charts
- Add a rating distribution chart (bar chart of rating 0-5 counts)

### 5. Frontend: Click-Through from Charts

- Each bar in a distribution chart becomes a clickable link
- Clicking a bar navigates to CaseList with the corresponding filter pre-applied
- Each cell in the cross-matrix becomes a clickable link
- Clicking a cell navigates to CaseList with both row+column filters pre-applied
- Implementation: navigate to `/cases?discipline=xxx&mediaType=yyy` etc.

### 6. Frontend: Export

- Add an "Export" button next to "Copy Conclusions"
- Export current analysis data as Markdown table
- Include: total cases, all distributions, cross-matrix, generated insights

### 7. Frontend: Filter Enhancement

- Add composition and colorTone filter dropdowns to the filter bar
- Keep existing filters unchanged

## Out of Scope

- New database fields (composition-related dimensions)
- Time trend analysis (no reliable date field)
- Correlation/heatmap visualization
- New "coding workbench" page
- AI re-classification batch job

## Dimension Configuration

The 6 dimensions available for filtering, distribution, and cross-matrix:

| Field | Display Label | Filter Key |
|-------|--------------|------------|
| mediaType | 呈现方式 | mediaType / media_type |
| contentType | 内容类型 | contentType / content_type |
| discipline | 学科 | discipline |
| visualStyle | 视觉风格 | visualStyle / visual_style |
| composition | 构图 | composition |
| colorTone | 色调 | colorTone / color_tone |

Plus rating (0-5) available for distribution only, not for cross-matrix rows.

## Implementation Order

1. Backend: extend types, add distributions, add generic cross-matrix
2. Frontend: update types, add dimension selectors, add distribution charts
3. Frontend: implement click-through from charts/matrix
4. Frontend: add export functionality