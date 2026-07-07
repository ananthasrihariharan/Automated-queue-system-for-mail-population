# Requirements Document

## Introduction

This feature adds an alternative **Grid Image Layout** to the Finishing and Post Press module dashboards. Users can switch between the existing default card/table layout and the new grid layout using a layout switcher in the top toolbar. The selected layout persists across sessions using `localStorage`. The grid layout is a mobile-first, two-column scrollable grid where each card shows a large preview image alongside a compact information section. Clicking on a card's customer name, job ID, or the card itself opens a Card Module View page that displays full job details using React Router navigation. Image clicks open a full-screen preview modal. Both layouts continue to share the same backend APIs, data structures, filters, search, tabs, and scroll position.

## Glossary

- **Dashboard**: Either `FinishingDashboard` or `PostPressDashboard` — the main module screen for Finishing or Post Press operators.
- **Default Layout**: The existing list/table + mobile card layout currently rendered by the dashboards.
- **Grid Image Layout**: The new two-column image-centred card grid introduced by this feature.
- **Layout Switcher**: A dropdown or toggle control in the top toolbar that lets the user choose between Default Layout and Grid Image Layout.
- **GridImageCard**: A reusable React component that renders a single job card in the Grid Image Layout.
- **Card Module View**: A dedicated React route (`/card-view/:jobId`) that displays full job details for a selected job.
- **CardPreviewModal**: A full-screen image lightbox that opens when a user clicks on a card image in the Grid Image Layout.
- **MobileTopBar**: The existing shared top-bar component used by both dashboards.
- **Layout_Preference**: A `localStorage` key that stores the user's chosen layout (`"default"` or `"grid"`).
- **itemScreenshots**: The field on job items (`item.screenshot`) that contains the path to the item's uploaded design image.
- **WorkflowJobDetailsModal**: The existing modal component used for job detail display in the Default Layout.
- **TanStack_Query**: The data-fetching library already in use in both dashboards.
- **Column Count Selector**: A control in the top toolbar (visible only in Grid Image Layout mode) that lets the user choose how many columns the grid renders — "1 Column" or "2 Columns".
- **Grid_Columns_Preference**: A `localStorage` key (per dashboard) that stores the user's chosen column count (`1` or `2`). Keys: `"finishing_grid_columns"` and `"postpress_grid_columns"`.

---

## Requirements

### Requirement 1: Layout Switcher in Top Toolbar

**User Story:** As an operator, I want a layout switcher control in the top toolbar, so that I can choose which card layout to use without leaving the current screen.

#### Acceptance Criteria 

1. THE `Dashboard` SHALL render a Layout Switcher control in the top toolbar alongside the existing search bar, date selector, filter button, and Active/History tabs.
2. THE `Layout Switcher` SHALL offer exactly two options: "Default Layout" and "Grid Image Layout".
3. WHEN the user selects "Default Layout" from the `Layout Switcher`, THE `Dashboard` SHALL display the existing list/table layout immediately.
4. WHEN the user selects "Grid Image Layout" from the `Layout Switcher`, THE `Dashboard` SHALL display the `GridImageCard` grid immediately.
5. THE `Layout Switcher` SHALL be accessible on both the Finishing and Post Press dashboards.
6. THE `Layout Switcher` SHALL apply to the `MobileTopBar` on mobile viewports and to the desktop toolbar on desktop viewports.

---

### Requirement 2: Layout Preference Persistence

**User Story:** As an operator, I want my layout choice to be remembered, so that I don't have to re-select it every time I visit the module.

#### Acceptance Criteria

1. WHEN the user selects a layout option, THE `Dashboard` SHALL write the chosen layout value (`"default"` or `"grid"`) to the `Layout_Preference` key in `localStorage`.
2. WHEN the `Dashboard` mounts, THE `Dashboard` SHALL read the `Layout_Preference` key from `localStorage` and initialise the active layout accordingly.
3. IF the `Layout_Preference` key is absent from `localStorage`, THEN THE `Dashboard` SHALL default to "Default Layout".
4. THE stored `Layout_Preference` SHALL persist independently for Finishing and Post Press dashboards using distinct `localStorage` key names (`"finishing_layout_preference"` and `"postpress_layout_preference"`).

---

### Requirement 3: Layout Switch Without Page Reload

**User Story:** As an operator, I want switching layouts to be instant, so that I can compare layouts or correct my choice without losing my current context.

#### Acceptance Criteria

1. WHEN the user switches layouts, THE `Dashboard` SHALL re-render the job list in the new layout without triggering a full page reload.
2. WHEN the user switches layouts, THE `Dashboard` SHALL preserve the current `searchQuery`, `dateFilter`, `viewMode`, `selectedTaskFilter`, and scroll position.
3. THE `Dashboard` SHALL apply a smooth CSS transition animation when switching between layouts.
4. THE active `TanStack_Query` cache SHALL remain valid across a layout switch so that no additional network requests are made solely due to switching layouts.

---

### Requirement 4: Grid Image Layout — Card Structure

**User Story:** As an operator, I want each job card in the grid to show a clear image preview and essential job details, so that I can quickly identify jobs at a glance.

#### Acceptance Criteria

1. WHEN the Grid Image Layout is active, THE `Dashboard` SHALL render job cards using the `GridImageCard` component in a two-column responsive grid.
2. THE `GridImageCard` SHALL display a large preview image in the upper section of the card, sourced from the job item's `itemScreenshots` field using the `jobThumbnailUrl` helper.
3. IF no screenshot is available for a job, THEN THE `GridImageCard` SHALL display a placeholder graphic in the image area.
4. THE `GridImageCard` SHALL display the customer name in the lower information section of the card.
5. THE `GridImageCard` SHALL display the job ID in the lower information section of the card.
6. THE `GridImageCard` SHALL apply rounded corners, soft box shadows, and compact spacing consistent with a production-management style.
7. THE `GridImageCard` SHALL be rendered as a memoised component using `React.memo` to avoid unnecessary re-renders.

---

### Requirement 5: Grid Image Layout — Visual and Responsive Design

**User Story:** As an operator using a mobile device, I want the grid to adapt to my screen size, so that I can comfortably use the layout on any device.

#### Acceptance Criteria

1. WHEN no column count preference is stored, THE Grid Image Layout SHALL render two cards per row on mobile viewports (screen width below 640 px) by default.
2. WHEN no column count preference is stored and the viewport width is 640 px or above, THE Grid Image Layout SHALL render three or more cards per row as space allows by default.
3. WHEN the user has set a column count preference via the Column Count Selector (Requirement 12), THE `Dashboard` SHALL honour the stored preference and override the default responsive column rules.
4. THE Grid Image Layout SHALL be vertically scrollable and SHALL NOT require horizontal scrolling regardless of the selected column count.
5. THE `GridImageCard` customer name and job ID SHALL use a minimum tap target size of 44 × 44 CSS pixels for touch-friendliness.
6. THE `GridImageCard` SHALL display a hover/touch highlight effect on the customer name and job ID to indicate they are clickable.
7. THE `GridImageCard` customer name and job ID SHALL display `cursor: pointer`.

---

### Requirement 6: Card Interaction — Open Card Module View

**User Story:** As an operator, I want to open a detailed job view by tapping a card's customer name, job ID, or the card body, so that I can access full job details quickly.

#### Acceptance Criteria

1. WHEN the user clicks the customer name on a `GridImageCard`, THE `Dashboard` SHALL navigate to the `Card Module View` route `/card-view/:jobId` using React Router.
2. WHEN the user clicks the job ID on a `GridImageCard`, THE `Dashboard` SHALL navigate to the `Card Module View` route `/card-view/:jobId` using React Router.
3. WHEN the user clicks the body of a `GridImageCard` (excluding the image area), THE `Dashboard` SHALL navigate to the `Card Module View` route `/card-view/:jobId` using React Router.
4. WHEN the user clicks the image area of a `GridImageCard`, THE `Dashboard` SHALL open the `CardPreviewModal` full-screen image preview instead of navigating to the `Card Module View`.
5. THE `Dashboard` SHALL apply a brief highlight animation to the selected `GridImageCard` before initiating navigation.

---

### Requirement 7: Card Module View Page

**User Story:** As an operator, I want the Card Module View to show all relevant job and item details, so that I have complete context without needing to open a separate modal.

#### Acceptance Criteria

1. THE `Card Module View` SHALL be accessible at the route `/card-view/:jobId`.
2. THE `Card Module View` SHALL be loaded lazily using `React.lazy` and `Suspense` to avoid bloating the initial bundle.
3. WHEN the `Card Module View` mounts, THE `Card Module View` SHALL fetch and display the full job details for the provided `jobId` using the existing backend API.
4. THE `Card Module View` SHALL display the following sections: customer details, uploaded design/image preview, process tracking (status timeline), cutting details, lamination details, binding details, quantity, notes/comments, and assigned operator.
5. IF the `jobId` parameter in the route is not found by the API, THEN THE `Card Module View` SHALL display a descriptive "Job not found" error state.
6. THE `Card Module View` SHALL provide a back-navigation control that returns the user to the previous dashboard screen without a full page reload.
7. THE back-navigation SHALL use React Router's `navigate(-1)` to preserve browser history.

---

### Requirement 8: Card Preview Modal

**User Story:** As an operator, I want to view a full-screen version of the job design image, so that I can inspect print artwork details clearly.

#### Acceptance Criteria

1. THE `CardPreviewModal` SHALL render the job item's screenshot at full-screen or near-full-screen dimensions.
2. WHEN the `CardPreviewModal` is open, THE `CardPreviewModal` SHALL overlay the dashboard content without navigating away.
3. WHEN the user taps or clicks outside the image area of the `CardPreviewModal`, THE `CardPreviewModal` SHALL close.
4. WHEN the user taps or clicks a close button inside the `CardPreviewModal`, THE `CardPreviewModal` SHALL close.
5. THE `CardPreviewModal` SHALL use `createPortal` to render outside the dashboard DOM tree and avoid stacking-context issues.

---

### Requirement 9: Empty State in Grid Image Layout

**User Story:** As an operator, I want to see a clear message when no jobs are available, so that I know the queue is empty and the screen is not broken.

#### Acceptance Criteria

1. WHEN the Grid Image Layout is active and the job list is empty, THE `Dashboard` SHALL display an empty-state UI within the grid container.
2. THE empty-state UI SHALL include a descriptive icon or illustration and a short message indicating there are no jobs for the selected filters.
3. THE empty-state UI SHALL be consistent in style with the empty state used in the Default Layout.

---

### Requirement 12: Grid Column Count Selector

**User Story:** As an operator, I want to change the number of columns displayed in the Grid Image Layout, so that I can choose a view density that suits my screen and preference — for example, a single large-card column when I want more detail, or two columns when I want to see more jobs at once.

#### Acceptance Criteria

1. WHEN the Grid Image Layout is active, THE `Dashboard` SHALL render a column count selector control alongside the Layout Switcher in the top toolbar.
2. THE column count selector SHALL offer at least two options: "1 Column" and "2 Columns".
3. WHEN the user selects "1 Column", THE Grid Image Layout SHALL render one `GridImageCard` per row spanning the full container width.
4. WHEN the user selects "2 Columns", THE Grid Image Layout SHALL render two `GridImageCard` components per row on all viewport widths.
5. THE column count selector SHALL only be visible and active when the Grid Image Layout is selected; it SHALL be hidden when the Default Layout is active.
6. WHEN the user changes the column count, THE `Dashboard` SHALL re-render the grid immediately without a page reload and without losing the current search, filter, or scroll state.
7. THE selected column count SHALL be persisted in `localStorage` using a per-dashboard key (`"finishing_grid_columns"` and `"postpress_grid_columns"`) so that the preference is restored on next visit.
8. IF no column count preference is stored in `localStorage`, THEN THE `Dashboard` SHALL default to "2 Columns".
9. THE column count selector SHALL apply a smooth CSS transition when the grid reflows between column counts.
10. THE `GridImageCard` component SHALL adapt its image height and font sizes proportionally when rendered in 1-column mode so that the larger card area is used effectively.

---

### Requirement 10: Shared Data and Filter Compatibility

**User Story:** As an operator, I want filters, search, and tabs to work identically in both layouts, so that switching layouts never causes me to lose my current view context.

#### Acceptance Criteria

1. THE Grid Image Layout SHALL consume the same `TanStack_Query` query results as the Default Layout without issuing duplicate or separate API requests.
2. WHEN a filter, search term, date, or tab is changed while the Grid Image Layout is active, THE `Dashboard` SHALL apply the change to the grid job list identically to how it would be applied in the Default Layout.
3. THE `GridImageCard` components SHALL not trigger re-renders of the full job list when only the layout is toggled.

---

### Requirement 11: Performance — Memoisation and Lazy Loading

**User Story:** As an operator working with large job queues, I want the grid layout to stay responsive, so that I can scroll and interact without lag.

#### Acceptance Criteria

1. THE `GridImageCard` component SHALL be memoised using `React.memo` so that it only re-renders when its job data or click handler props change.
2. THE `Card Module View` component SHALL be code-split and loaded lazily using `React.lazy` and `Suspense`.
3. THE `GridImageCard` preview images SHALL use the `loading="lazy"` attribute on the `<img>` element to defer off-screen image loading.
4. THE `Dashboard` SHALL not trigger a full re-mount of the job list when switching between layouts; only the rendering component SHALL change.
