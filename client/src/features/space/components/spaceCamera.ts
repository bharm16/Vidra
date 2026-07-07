/**
 * Space camera math (ADR-0012 / M5). Pure so the fiddly part — where to scroll
 * so a node lands dead-center — is testable without a DOM.
 *
 * Both rects come from `getBoundingClientRect()`, which is already
 * post-transform, so zoom is baked into the pixel coordinates: centering the
 * rendered box needs no separate scale factor. The returned scroll is absolute
 * (add the viewport-space delta to the container's current scroll).
 */
interface ContainerViewport {
  scrollLeft: number;
  scrollTop: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface NodeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function computeCenteredScroll(
  container: ContainerViewport,
  node: NodeRect,
): { scrollLeft: number; scrollTop: number } {
  const nodeCenterX = node.left + node.width / 2;
  const nodeCenterY = node.top + node.height / 2;
  const containerCenterX = container.left + container.width / 2;
  const containerCenterY = container.top + container.height / 2;
  return {
    scrollLeft: container.scrollLeft + (nodeCenterX - containerCenterX),
    scrollTop: container.scrollTop + (nodeCenterY - containerCenterY),
  };
}
