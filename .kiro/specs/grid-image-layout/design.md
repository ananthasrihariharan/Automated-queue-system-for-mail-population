# Design Document

## Overview

This design adds an alternative **Grid Image Layout** to `FinishingDashboard` and `PostPressDashboard`. Operators can switch between the existing Default Layout (table + mobile cards) and the new Grid Image Layout using a Layout Switcher added to each dashboard's toolbar and `MobileTopBar` menu. When Grid Image Layout is active a **Column Count Selector** also appears, letting operators switch between a 1-column and 2-column grid. Both preferences persist in `localStorage` per dashboard. No new backend APIs are needed — the grid reuses all existing TanStack Query data.

---

## Architecture

```
FinishingDashboard / PostPressDashboard
  ├── MobileTopBar  (extended: layoutMode + gridColumns props)
  ├── Desktop Toolbar  (Layout Switcher + Column Count Selector added inline)
  ├── Existing filters / tabs / search  (unchanged)
  │
  ├── [layoutMode === 'default']  → existing table + mobile card markup (unchanged)
  │
  └── [layoutMode === 'grid']
        ├── GridImageGrid  (wrapper div — applies grid CSS columns)
        │     └── GridImageCard × N  (React.memo)
        └── CardPreviewModal  (portal, shown when card image clicked)

New route: /card-view/:jobId
  └── CardModuleView  (React.lazy, loaded on demand)
```

---

## New Files

| File | Purpose |
|---|---|
| `src/components/GridImageCard.tsx` | Reusable memoised job card for the grid layout |
| `src/components/GridImageCard.css` | Card styles (image, info section, hover effects) |
| `src/components/CardPreviewModal.tsx` | Full-screen image lightbox via `createPortal` |
| `src/pages/CardModuleView.tsx` | Lazy-loaded `/card-view/:jobId` full-detail page |
| `src/pages/CardModuleView.css` | Styles for the card module view page |

---

## Modified Files

| File | Change |
|---|---|
| `src/modules/finishing/FinishingDashboard.tsx` | Add `layoutMode` + `gridColumns` state, Layout Switcher, Column Count Selector, Grid rendering branch |
| `src/modules/postpress/PostPressDashboard.tsx` | Same additions as Finishing |
| `src/components/MobileTopBar.tsx` | Add optional `layoutMode`, `onLayoutModeChange`, `gridColumns`, `onGridColumnsChange` props; render Layout Switcher + Column Count Selector in the mobile dropdown menu |
| `src/app/router.tsx` | Add lazy route for `/card-view/:jobId` |

---

## Component Designs

### 1. `GridImageCard`

**Props:**
```tsx
interface GridImageCardProps {
  job: any
  columns: 1 | 2
  onCardClick: (jobId: string) => void
  onImageClick: (imageUrl: string) => void
}
```

**Visual structure (matches hand-drawn sketch):**
```
┌─────────────────────────────┐
│                             │
│        IMAGE AREA           │  ← ~70% card height, object-fit: cover
│      (job screenshot)       │
│                             │
├─────────────────────────────┤
│  Customer Name   │  #JobId  │  ← bottom info strip, ~30% card height
└─────────────────────────────┘
```

**Markup:**
```tsx
<article
  data-columns={columns}
  role="button"
  aria-label={`Job ${job.jobId} – ${job.customerName}`}
  className="gic-card"
>
  <div className="gic-image-area" onClick={handleImageClick}>
    {thumb
      ? <img src={thumb} alt="" loading="lazy" className="gic-img" />
      : <div className="gic-placeholder"><PlaceholderSVG /></div>
    }
  </div>
  <div className="gic-info" onClick={handleCardClick}>
    <span className="gic-customer">{job.customerName}</span>
    <span className="gic-jobid">#{job.jobId}</span>
  </div>
</article>
```

- Wrapped in `React.memo` — re-renders only when `job` or handlers change.
- `columns` prop drives `data-columns="1|2"` attribute used by CSS for proportional sizing.
- Image area click is `stopPropagation`-isolated from the info strip / card body.
- Hover/touch highlight uses CSS `:hover` and `@media (hover: none)` active state on the whole card.
- Info strip: `display: flex; justify-content: space-between; align-items: center` — customer name left, job ID right.
- Minimum tap target: `.gic-info` has `min-height: 44px`.

**CSS card proportions:**
```css
.gic-card {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.10);
  background: #fff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.gic-card:hover, .gic-card:active {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}

/* Image area: 70% of card height */
.gic-image-area {
  flex: 7;
  min-height: 0;
  overflow: hidden;
  background: #f1f5f9;
}
.gic-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Info strip: 30% of card height, min 44px for tap target */
.gic-info {
  flex: 3;
  min-height: 44px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 0.6rem;
  background: #fff;
  border-top: 1px solid #f1f5f9;
}
.gic-customer {
  font-weight: 700;
  font-size: 0.78rem;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60%;
  cursor: pointer;
}
.gic-jobid {
  font-size: 0.72rem;
  font-weight: 600;
  color: #3730a3;
  white-space: nowrap;
  cursor: pointer;
}

/* Column mode height: card needs a fixed height for the flex ratio to work */
[data-columns="2"] .gic-card, .grid-image-layout .gic-card {
  height: 200px;
}
[data-columns="1"] .gic-card {
  height: 280px;
}
```

---

### 2. `CardPreviewModal`

**Props:**
```tsx
interface CardPreviewModalProps {
  imageUrl: string | null
  onClose: () => void
}
```

- Rendered via `ReactDOM.createPortal(…, document.body)`.
- Backdrop click → `onClose`. Close button (×) → `onClose`.
- `<img>` fills viewport with `object-fit: contain`.
- `useEffect` locks `document.body` scroll while open; restores on unmount.
- Keyboard: `Escape` key → `onClose`.
- Conditional render: `if (!imageUrl) return null`.

---

### 3. `CardModuleView` (lazy page)

**Route:** `/card-view/:jobId`

**Data fetching:** Uses `useQuery` with a new `fetchJobById` API call:
```ts
// src/services/api.ts — add:
export const fetchJobById = async (jobId: string) => {
  const res = await api.get(`/api/admin/jobs/${jobId}`)
  return res.data
}
```
> The existing `/api/admin/jobs` endpoint already accepts job-level queries; a dedicated `/api/admin/jobs/:jobId` route is assumed based on `fetchJobStatus` (`/api/prepress/jobs/:jobId/status`). If not available, the admin jobs list with `search=jobId` and extracting the first result is the fallback.

**Sections rendered (from job data):**
1. Customer details (name, contact)
2. Design image preview (uses `jobThumbnailUrl`)
3. Process tracking (uses existing `WorkflowStepTracker` component)
4. Cutting / lamination / binding / quantity details
5. Notes / comments
6. Assigned operator

**Back navigation:**
```tsx
const navigate = useNavigate()
<button onClick={() => navigate(-1)}>← Back</button>
```

**Error state:** If `isError` or `!job` after loading → "Job not found" message with back button.

**Lazy loading in router:**
```tsx
const CardModuleView = React.lazy(() => import('../pages/CardModuleView'))
// wrapped in <Suspense fallback={<Spinner />}>
```

---

### 4. Layout Switcher + Column Count Selector

**State (per dashboard):**
```tsx
type LayoutMode = 'default' | 'grid'
type GridColumns = 1 | 2

const LAYOUT_KEY = 'finishing_layout_preference'   // or 'postpress_layout_preference'
const COLUMNS_KEY = 'finishing_grid_columns'        // or 'postpress_grid_columns'

const [layoutMode, setLayoutMode] = useState<LayoutMode>(
  () => (localStorage.getItem(LAYOUT_KEY) as LayoutMode) ?? 'default'
)
const [gridColumns, setGridColumns] = useState<GridColumns>(
  () => Number(localStorage.getItem(COLUMNS_KEY) ?? 2) as GridColumns
)

const handleLayoutChange = (mode: LayoutMode) => {
  setLayoutMode(mode)
  localStorage.setItem(LAYOUT_KEY, mode)
}
const handleColumnsChange = (cols: GridColumns) => {
  setGridColumns(cols)
  localStorage.setItem(COLUMNS_KEY, String(cols))
}
```

**Mobile layout toggle placement — visible icon on the top bar row:**

The layout switch button is a **visible icon button on the `MobileTopBar` top row itself** — sitting between the search bar and the hamburger (≡). It is always visible, no need to open the menu.

```
[FINISHING]  [🔍 Search...]  [⊞/☰]  [1|2]  [≡]
                                ↑      ↑       ↑
                          layout  col    hamburger
                          toggle toggle  menu
```

- When `layoutMode === 'default'`: shows grid icon (⊞) — tap to switch to grid
- When `layoutMode === 'grid'`: shows list icon (☰) — tap to switch back to list  
- When `layoutMode === 'grid'`: a compact `[1] [2]` column toggle also appears inline on the top row
- Tapping updates state + `localStorage` instantly — no dropdown needed

**MobileTopBar top row markup (updated):**
```tsx
<div className="mobile-topbar-row">
  <span className="mobile-topbar-title">{title}</span>

  {/* Search bar */}
  <div className="mobile-topbar-search">...</div>

  {/* Layout toggle — always visible when prop is provided */}
  {onLayoutModeChange && (
    <button
      className="mobile-topbar-layout-btn"
      onClick={() => onLayoutModeChange(layoutMode === 'default' ? 'grid' : 'default')}
      title={layoutMode === 'grid' ? 'Switch to List' : 'Switch to Grid'}
      aria-label={layoutMode === 'grid' ? 'List Layout' : 'Grid Layout'}
    >
      {layoutMode === 'grid' ? <ListIcon /> : <GridIcon />}
    </button>
  )}

  {/* Column count toggle — only in grid mode */}
  {layoutMode === 'grid' && onGridColumnsChange && (
    <div className="mobile-topbar-col-toggle">
      <button
        className={gridColumns === 1 ? 'active' : ''}
        onClick={() => onGridColumnsChange(1)}
        aria-label="1 column"
      >1</button>
      <button
        className={gridColumns === 2 ? 'active' : ''}
        onClick={() => onGridColumnsChange(2)}
        aria-label="2 columns"
      >2</button>
    </div>
  )}

  {/* Hamburger */}
  <button className="mobile-topbar-hamburger" onClick={() => setMenuOpen(v => !v)}>≡</button>
</div>
```

**Desktop toolbar (added to `press-filters-bar`):**
```tsx
{/* Layout switcher */}
<div className="layout-switcher">
  <button
    className={`layout-btn ${layoutMode === 'default' ? 'active' : ''}`}
    onClick={() => handleLayoutChange('default')}
    title="Default Layout"
  >
    <ListIcon /> <span>List</span>
  </button>
  <button
    className={`layout-btn ${layoutMode === 'grid' ? 'active' : ''}`}
    onClick={() => handleLayoutChange('grid')}
    title="Grid Image Layout"
  >
    <GridIcon /> <span>Grid</span>
  </button>
</div>

{/* Column count selector — only when grid is active */}
{layoutMode === 'grid' && (
  <div className="column-selector">
    <button
      className={`col-btn ${gridColumns === 1 ? 'active' : ''}`}
      onClick={() => handleColumnsChange(1)}
      title="1 Column"
    >1</button>
    <button
      className={`col-btn ${gridColumns === 2 ? 'active' : ''}`}
      onClick={() => handleColumnsChange(2)}
      title="2 Columns"
    >2</button>
  </div>
)}
```

**MobileTopBar extended props (additions only):**
```tsx
layoutMode?: LayoutMode
onLayoutModeChange?: (v: LayoutMode) => void
gridColumns?: GridColumns
onGridColumnsChange?: (v: GridColumns) => void
```
These props drive the **top-row** layout toggle and column buttons. The hamburger dropdown is not involved in layout switching.

---

### 5. Grid Container

Rendered inside each dashboard in place of the table when `layoutMode === 'grid'`:

```tsx
{layoutMode === 'grid' ? (
  <div
    className="grid-image-layout"
    style={{ '--grid-cols': gridColumns } as React.CSSProperties}
  >
    {jobs.length === 0 ? (
      <GridEmptyState />
    ) : jobs.map((job: any) => (
      <GridImageCard
        key={job.jobId}
        job={job}
        columns={gridColumns}
        onCardClick={(jobId) => navigate(`/card-view/${jobId}`)}
        onImageClick={(url) => setPreviewImageUrl(url)}
      />
    ))}
  </div>
) : (
  /* existing table + mobile card markup — unchanged */
)}
```

**CSS:**
```css
.grid-image-layout {
  display: grid;
  grid-template-columns: repeat(var(--grid-cols, 2), 1fr);
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  transition: grid-template-columns 0.25s ease;
}

/* Default responsive fallback (no JS preference stored) */
@media (min-width: 640px) {
  .grid-image-layout[data-user-cols="false"] {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

---

## State Management

No new global state. All new state is local to each dashboard:

| State var | Type | Persisted | Notes |
|---|---|---|---|
| `layoutMode` | `'default' \| 'grid'` | `localStorage` | Per-dashboard key |
| `gridColumns` | `1 \| 2` | `localStorage` | Per-dashboard key |
| `previewImageUrl` | `string \| null` | No | Controls `CardPreviewModal` |

Existing state (`searchQuery`, `dateFilter`, `viewMode`, `selectedTaskFilter`, `currentPage`, `selectedJob`) is **unchanged**. Layout switching does not reset any of these.

---

## Routing

Add to `router.tsx`:

```tsx
import React, { Suspense } from 'react'
const CardModuleView = React.lazy(() => import('../pages/CardModuleView'))

// inside the children array:
{
  path: 'card-view/:jobId',
  element: (
    <Suspense fallback={<div className="dispatch-spinner" />}>
      <CardModuleView />
    </Suspense>
  )
}
```

No role guard is required — operators navigating from their own dashboard already have a session; the view only shows data the dashboard already fetched.

---

## Data Flow

```
Dashboard (TanStack Query cache)
  ↓  jobs[]  (same query, no duplication)
GridImageLayout
  ↓  job (per card)
GridImageCard
  ├── image click  →  setPreviewImageUrl(url)  →  CardPreviewModal
  └── card/name/id click  →  navigate('/card-view/:jobId')

/card-view/:jobId
  └── useQuery(['job-detail', jobId], fetchJobById)  → renders detail sections
```

---

## CSS Transition for Layout Switch

```css
/* Smooth transition container */
.layout-transition-wrapper {
  transition: opacity 0.18s ease;
}
.layout-transition-wrapper.switching {
  opacity: 0;
}
```

A `useLayoutEffect` briefly adds the `switching` class on `layoutMode` change then removes it after the 180 ms transition — giving a clean fade between layouts without unmounting query-connected components.

---

## Accessibility

- `GridImageCard` uses `<article>` with `role="button"` and `aria-label` including job ID and customer name.
- Image has `alt=""` (decorative) when it's a design thumbnail.
- `CardPreviewModal` traps focus; `Escape` closes.
- Layout Switcher and Column Count Selector buttons have `title` attributes and visible active states.
- All interactive elements meet WCAG 2.1 AA colour contrast minimums using the existing design-system palette (`#0f172a`, `#3730a3`, `#e0e7ff`).

---

## Performance Notes

- `GridImageCard` is `React.memo` — re-renders only on `job` reference change or handler change. Handlers are stable callbacks defined with `useCallback` in the dashboard.
- `CardModuleView` is code-split via `React.lazy` — zero cost until first navigation.
- Card images use `loading="lazy"` — off-screen images are not fetched until needed.
- Layout switch does **not** unmount the TanStack Query provider or reset any query keys — the cache remains fully valid.
- `gridColumns` state change only updates a CSS custom property via inline `style`; no job-list re-render is needed.
