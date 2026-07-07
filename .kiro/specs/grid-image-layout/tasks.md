# Implementation Plan: Grid Image Layout

## Overview

Implement the Grid Image Layout feature for `FinishingDashboard` and `PostPressDashboard`. This adds a Layout Switcher (Default vs Grid), a Column Count Selector (1 or 2 columns), a `GridImageCard` component, a `CardPreviewModal`, and a `CardModuleView` lazy page at `/card-view/:jobId`. All preferences persist per-dashboard in `localStorage`. No new backend APIs are required except a single `fetchJobById` helper.

## Tasks

- [ ] 1. Add `fetchJobById` to the API service
  - [ ] 1.1 Open `src/services/api.ts`
  - [ ] 1.2 Add `fetchJobById(jobId: string)` that calls `GET /api/admin/jobs/${jobId}` and returns `res.data`
  - [ ] 1.3 If a single-job endpoint is unavailable, implement fallback: call `fetchAdminJobs` with `search=jobId`, extract and return `res.data.jobs[0]`, throw a not-found error if empty

- [ ] 2. Build `GridImageCard` component
  - [ ] 2.1 Create `src/components/GridImageCard.tsx` — `<article>` with `data-columns` attribute, image area (lazy img or placeholder SVG), info section with `.gic-customer` and `.gic-jobid` spans; image click calls `onImageClick` + stops propagation; card/name/id click adds brief `gic-highlight` animation class then calls `onCardClick`; export as `export default memo(GridImageCard)`
  - [ ] 2.2 Create `src/components/GridImageCard.css` — image area height 140 px (2-col) / 220 px (1-col) via `[data-columns]` selector, rounded corners, box-shadow, `.gic-customer` and `.gic-jobid` with `min-height: 44px`, `cursor: pointer`, hover underline/colour, `@keyframes gic-highlight-anim` background flash

- [ ] 3. Build `CardPreviewModal` component
  - [ ] 3.1 Create `src/components/CardPreviewModal.tsx` — rendered via `ReactDOM.createPortal` into `document.body`, returns `null` when `imageUrl` is falsy, fixed full-screen backdrop with `onClick → onClose`, centred `<img>` at `max-width: 95vw; max-height: 90vh; object-fit: contain`, close × button (min 44 × 44 px), `useEffect` for Escape key listener and `document.body` scroll lock

- [ ] 4. Build `CardModuleView` lazy page
  - [ ] 4.1 Create `src/pages/CardModuleView.tsx` — uses `useParams<{ jobId }>`, `useQuery(['job-detail', jobId], fetchJobById)`, loading spinner, error/"Job not found" state with back button, sections: customer details, design image preview (`jobThumbnailUrl`), `WorkflowStepTracker`, cutting/lamination/binding/quantity, notes, assigned operator, back button via `navigate(-1)`
  - [ ] 4.2 Create `src/pages/CardModuleView.css` — max-width 720 px centred, section headings, label-value detail rows, image preview box, back button style matching `.press-btn-view`

- [ ] 5. Extend `MobileTopBar` with layout and column controls
  - [ ] 5.1 Add optional props to `MobileTopBarProps`: `layoutMode`, `onLayoutModeChange`, `gridColumns`, `onGridColumnsChange`
  - [ ] 5.2 In the **top bar row** (between search bar and the hamburger button), add a layout toggle icon button — shows grid icon (⊞) when `layoutMode === 'default'`, list icon (☰) when `layoutMode === 'grid'`; tapping immediately calls `onLayoutModeChange`; only rendered when `onLayoutModeChange` prop is provided; min 36×36 px tap target
  - [ ] 5.3 Also in the top bar row, when `layoutMode === 'grid'`, render a compact inline `[1] [2]` column count toggle immediately after the layout toggle button; only rendered when `onGridColumnsChange` is provided; active button styled with `#3730a3` background and white text

- [ ] 6. Add Grid Image Layout to `FinishingDashboard`
  - [ ] 6.1 Add `layoutMode` state initialised from `localStorage.getItem('finishing_layout_preference') ?? 'default'`
  - [ ] 6.2 Add `gridColumns` state initialised from `Number(localStorage.getItem('finishing_grid_columns')) || 2`
  - [ ] 6.3 Add `previewImageUrl` state (`string | null`, default `null`)
  - [ ] 6.4 Add `useCallback` handlers `handleLayoutChange` and `handleColumnsChange` that update both state and `localStorage`
  - [ ] 6.5 Pass `layoutMode`, `onLayoutModeChange`, `gridColumns`, `onGridColumnsChange` to `MobileTopBar`
  - [ ] 6.6 Add Layout Switcher (List / Grid buttons) and conditional Column Count Selector (1 / 2 buttons) to the desktop `press-filters-bar`
  - [ ] 6.7 Wrap the existing desktop table + mobile card markup in a `layoutMode === 'default'` conditional
  - [ ] 6.8 Add `layoutMode === 'grid'` branch: `<div className="grid-image-layout" style={{ '--grid-cols': gridColumns }}>` containing empty-state or `jobs.map(job => <GridImageCard … />)`; `onCardClick` uses `navigate('/card-view/${jobId}')`, `onImageClick` sets `previewImageUrl`
  - [ ] 6.9 Render `<CardPreviewModal imageUrl={previewImageUrl} onClose={() => setPreviewImageUrl(null)} />` at component root

- [ ] 7. Add Grid Image Layout to `PostPressDashboard`
  - [ ] 7.1 Apply same state, handlers, MobileTopBar props, and desktop controls as Task 6 using keys `'postpress_layout_preference'` and `'postpress_grid_columns'`
  - [ ] 7.2 Grid branch only renders inside the `mainView === 'active'` block — the Incoming tab retains its existing table view
  - [ ] 7.3 Render `<CardPreviewModal>` at component root

- [ ] 8. Add CSS for grid container, layout switcher, and column selector
  - [ ] 8.1 Append to `src/modules/press/PressDashboard.css`: `.grid-image-layout` with `display: grid; grid-template-columns: repeat(var(--grid-cols, 2), 1fr); gap: 0.75rem; padding: 0.75rem 1rem; transition: grid-template-columns 0.25s ease`; `.layout-switcher`, `.layout-btn`, `.layout-btn.active`, `.column-selector`, `.col-btn`, `.col-btn.active`, `.grid-empty-state` rules as specified in the design document

- [ ] 9. Register the `/card-view/:jobId` route
  - [ ] 9.1 In `src/app/router.tsx`, add `const CardModuleView = React.lazy(() => import('../pages/CardModuleView'))`
  - [ ] 9.2 Add route `{ path: 'card-view/:jobId', element: <Suspense fallback={<spinner>}><CardModuleView /></Suspense> }` to the children array

- [ ] 10. Build and verify
  - [ ] 10.1 Run `npm run build` in `printing-press-frontend` — confirm zero TypeScript errors
  - [ ] 10.2 Verify layout toggle icon button is visible on the **top bar row** of both dashboards (not inside hamburger menu), switches layout on tap, grid renders `GridImageCard` components, `[1] [2]` column toggle appears inline in top bar only when in grid mode, 1-col/2-col reflows correctly, preferences persist on page refresh, card image click opens `CardPreviewModal`, card body/name/id click navigates to `/card-view/:jobId`, `CardModuleView` renders details and back button works, layout switch preserves all filter/search/tab state, empty state renders when job list is empty

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2", "3", "5", "8"] },
    { "wave": 2, "tasks": ["4", "6", "7"] },
    { "wave": 3, "tasks": ["9"] },
    { "wave": 4, "tasks": ["10"] }
  ]
}
```

## Notes

- The Layout Switcher and Column Count Selector share the same `press-filters-bar` row as the existing date picker, search, and task filter — no toolbar restructuring needed.
- `GridImageCard` uses `jobThumbnailUrl` and `firstItemScreenshot` already exported from `WorkflowJobDetailsModal` — no utility duplication.
- No changes to backend routes. `CardModuleView` reuses the existing admin jobs endpoint.
- The CSS custom property `--grid-cols` is set via `style` prop on the grid container; the CSS `transition` on `grid-template-columns` provides the smooth reflow animation (Requirement 12.9).
- All existing dashboard state (`searchQuery`, `dateFilter`, `viewMode`, `selectedTaskFilter`, `currentPage`) is unaffected by layout switching — only the rendering branch changes.
