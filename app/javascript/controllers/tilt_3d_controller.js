import { Controller } from "@hotwired/stimulus";

// Tilts the controller's element in 3D based on cursor position. Listens at
// the window level so the card starts reacting before the cursor enters it,
// avoiding the flicker you get when a tilted edge swaps in/out from under
// the cursor at corners. Writes `--tilt-x` / `--tilt-y` (deg) and
// `--tilt-transition` (duration) for the stylesheet to consume.
//
// Values:
//   max     – maximum tilt in degrees on each axis
//   falloff – how far past the card edge influence persists, expressed in
//             half-card units (0.5 = half a card-width of fade outside).
export default class extends Controller {
  static values = {
    max: { type: Number, default: 8 },
    falloff: { type: Number, default: 0.5 },
  };

  connect() {
    this.onMove = this.onMove.bind(this);
    this.onLeaveWindow = this.onLeaveWindow.bind(this);
    window.addEventListener("mousemove", this.onMove, { passive: true });
    document.addEventListener("mouseleave", this.onLeaveWindow);
    this.frame = null;
  }

  disconnect() {
    window.removeEventListener("mousemove", this.onMove);
    document.removeEventListener("mouseleave", this.onLeaveWindow);
    if (this.frame) cancelAnimationFrame(this.frame);
  }

  onMove(e) {
    if (this.frame) return;
    const { clientX, clientY } = e;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      const rect = this.element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (clientX - cx) / (rect.width / 2);
      const dy = (clientY - cy) / (rect.height / 2);

      // Distance past the card's edge in half-card units (0 if inside).
      const overshoot = Math.max(0, Math.abs(dx) - 1, Math.abs(dy) - 1);
      const influence = Math.max(0, 1 - overshoot / this.falloffValue);

      // Clamp the rotation input so the cursor sliding past the corner
      // produces max tilt rather than runaway angles.
      const tdx = Math.max(-1, Math.min(1, dx));
      const tdy = Math.max(-1, Math.min(1, dy));
      const max = this.maxValue;
      const rx = -tdy * max * influence;
      const ry = tdx * max * influence;

      // Snappier tracking while cursor is in/near the card; longer ease
      // back to rest once it has moved out of range.
      const transition = influence > 0.01 ? "120ms" : "500ms";
      this.element.style.setProperty("--tilt-transition", transition);
      this.element.style.setProperty("--tilt-x", `${rx.toFixed(2)}deg`);
      this.element.style.setProperty("--tilt-y", `${ry.toFixed(2)}deg`);
    });
  }

  onLeaveWindow() {
    this.element.style.setProperty("--tilt-transition", "500ms");
    this.element.style.setProperty("--tilt-x", "0deg");
    this.element.style.setProperty("--tilt-y", "0deg");
  }
}
