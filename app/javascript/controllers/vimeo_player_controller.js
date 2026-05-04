import { Controller } from "@hotwired/stimulus";

// Lazy-load the Vimeo Player SDK once per page. Returned promise resolves
// when window.Vimeo is available.
let sdkPromise = null;
function loadVimeoSdk() {
  if (window.Vimeo && window.Vimeo.Player) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://player.vimeo.com/api/player.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return sdkPromise;
}

// Wraps a Vimeo iframe with custom play/pause, scrub, and mute controls,
// and attempts to autoplay with sound. Browsers block unmuted autoplay
// until a user gesture, so we start muted and unmute on the first
// pointerdown/keydown anywhere on the page if we couldn't unmute on load.
export default class extends Controller {
  static targets = ["iframe", "scrub"];

  async connect() {
    await loadVimeoSdk();
    if (!this.element.isConnected) return;

    this.player = new window.Vimeo.Player(this.iframeTarget);
    this.isScrubbing = false;
    this.userTouchedMute = false;

    this.player.ready().then(async () => {
      try {
        const duration = await this.player.getDuration();
        this.scrubTarget.max = String(duration);
      } catch (_) {}
      // Reflect the iframe's initial muted state in the UI before we attempt
      // to flip it, so the mute icon doesn't briefly lie to the user.
      try {
        const muted = await this.player.getMuted();
        this._setMutedState(muted);
      } catch (_) {}
      // Try to unmute right away. Most browsers will reject this without a
      // user gesture; we silently fall back to muted in that case.
      this._tryUnmute();
    });

    this.player.on("play", () => this._setPlayState(true));
    this.player.on("pause", () => this._setPlayState(false));
    this.player.on("timeupdate", ({ seconds, percent }) => {
      if (!this.isScrubbing) {
        this.scrubTarget.value = String(seconds);
        this._setProgress(percent);
      }
    });
    this.player.on("volumechange", async () => {
      const muted = await this.player.getMuted();
      this._setMutedState(muted);
    });

    // First-gesture fallback: if we're still muted after page load, unmute
    // the moment the user does anything — unless they've already toggled
    // the mute button themselves. Bubble phase (capture: false) so the mute
    // button's own handler runs first and userTouchedMute is set in time.
    this._firstGesture = this._firstGesture.bind(this);
    document.addEventListener("pointerdown", this._firstGesture, { once: true });
    document.addEventListener("keydown", this._firstGesture, { once: true });

    this._setupPin();
  }

  disconnect() {
    document.removeEventListener("pointerdown", this._firstGesture);
    document.removeEventListener("keydown", this._firstGesture);
    if (this._onPinScroll) {
      window.removeEventListener("scroll", this._onPinScroll);
    }
    if (this.player) this.player.destroy().catch(() => {});
  }

  // Pins the wrapper to the bottom-right of the viewport once the hero has
  // scrolled out of view. The same DOM element keeps playing — class flips
  // drive slide-in / slide-out animations.
  //
  // States: "unset" → "pinned" → "unpinning" → "unset".
  // "unpinning" keeps the .--pinned class (so the element stays fixed at the
  // bottom-right) while .--unpinning overrides the animation with the reverse;
  // both are stripped on animationend so the element returns to its hero spot.
  _setupPin() {
    this._hero = document.querySelector(".section.hero");
    if (!this._hero) return;
    this._pinState = "unset";
    this._pinTicking = false;
    this._onPinScroll = () => {
      if (this._pinTicking) return;
      this._pinTicking = true;
      requestAnimationFrame(() => {
        this._pinTicking = false;
        const bottom = this._hero.getBoundingClientRect().bottom;
        this._setPinned(bottom < 60);
      });
    };
    this._onPinAnimationEnd = (e) => {
      if (e.animationName !== "hero-video-pin-out") return;
      if (this._pinState !== "unpinning") return;
      this.element.classList.remove("hero__video--pinned");
      this.element.classList.remove("hero__video--unpinning");
      this._pinState = "unset";
    };
    window.addEventListener("scroll", this._onPinScroll, { passive: true });
    this.element.addEventListener("animationend", this._onPinAnimationEnd);
    this._onPinScroll();
  }

  _setPinned(wantPinned) {
    if (wantPinned) {
      if (this._pinState === "unpinning") {
        // Cancel the slide-out — element is still fixed, drop the override.
        this.element.classList.remove("hero__video--unpinning");
        this._pinState = "pinned";
      } else if (this._pinState === "unset") {
        this.element.classList.add("hero__video--pinned");
        this._pinState = "pinned";
      }
    } else if (this._pinState === "pinned") {
      this.element.classList.add("hero__video--unpinning");
      this._pinState = "unpinning";
    }
  }

  togglePlay(e) {
    if (e) e.preventDefault();
    this.player.getPaused().then((paused) => {
      if (paused) this.player.play();
      else this.player.pause();
    });
  }

  // Click anywhere on the video (outside the controls) toggles play/pause.
  wrapperClick(e) {
    if (e.target.closest(".hero__video-controls")) return;
    this.togglePlay(e);
  }

  toggleMute(e) {
    e.preventDefault();
    this.userTouchedMute = true;
    this.player.getMuted().then((muted) => {
      if (muted) this._tryUnmute();
      else this.player.setMuted(true);
    });
  }

  scrubInput() {
    this.isScrubbing = true;
    // Live-update the filled-progress visual as the user drags.
    const max = parseFloat(this.scrubTarget.max) || 0;
    const val = parseFloat(this.scrubTarget.value) || 0;
    this._setProgress(max > 0 ? val / max : 0);
  }

  scrubChange() {
    const t = parseFloat(this.scrubTarget.value);
    this.player
      .setCurrentTime(t)
      .catch(() => {})
      .finally(() => {
        this.isScrubbing = false;
      });
  }

  _setProgress(fraction) {
    const pct = Math.max(0, Math.min(1, fraction || 0)) * 100;
    this.scrubTarget.style.setProperty("--progress", `${pct.toFixed(2)}%`);
  }

  async _tryUnmute() {
    try {
      await this.player.setMuted(false);
      await this.player.setVolume(0.7);
    } catch (_) {
      // Autoplay policy blocked us — stay muted until a user gesture.
    }
  }

  _firstGesture(event) {
    if (this.userTouchedMute || !this.player) return;
    if (event?.target?.closest('[data-action*="vimeo-player#toggleMute"]')) return;
    this.player.getMuted().then((muted) => {
      if (muted) this._tryUnmute();
    });
  }

  _setPlayState(playing) {
    this.element.classList.toggle("hero__video--playing", playing);
  }

  _setMutedState(muted) {
    this.element.classList.toggle("hero__video--muted", muted);
  }
}
