/**
 * A pass-through layout, and it exists for one reason: without it the route
 * group holds no error boundary.
 *
 * The black-hole test twice produced a bare 500 where the ServiceUnavailable
 * screen should have been. The first cause was the boundary sitting inside the
 * layout that throws. Moving it up to the group did not fix it either, and the
 * RSC payload said why in one field:
 *
 *     "error":"$undefined","errorStyles":"$undefined"
 *
 * No boundary was registered at all. A route group only becomes a segment that
 * can carry error.tsx when it has a layout of its own; with none, the error.tsx
 * beside it is never mounted and the throw travels to the root unhandled.
 *
 * So this renders its children and nothing else. It adds no markup, no data
 * fetching and no auth — the dashboard and admin layouts below still own all of
 * that. Its whole job is to make the segment real.
 */
export default function GroupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
