/**
 * hero-launcher.ts
 *
 * Lightweight initial launcher (~1KB gzipped).
 * Runs immediately on page load without importing GSAP, ScrollTrigger, or Lenis.
 *
 * Responsibilities:
 * 1. Enforce scroll lock and scroll restoration before user interaction.
 * 2. Idle-prefetch the heavy cinematic module during idle time.
 * 3. Pre-warm video on hover/touchstart.
 * 4. On seal tap: start audio SYNCHRONOUSLY (within user activation),
 *    set video source, then hand off to the cinematic module.
 *
 * CRITICAL: Audio playback MUST be initiated synchronously within the
 * user-gesture handler, before any async boundary (dynamic import).
 * Otherwise browsers reject it as not user-initiated.
 */

let cinematicPromise: Promise<typeof import('./hero-cinematic')> | null = null;

export function prefetchCinematic(): Promise<typeof import('./hero-cinematic')> {
  if (!cinematicPromise) {
    cinematicPromise = import('./hero-cinematic');
  }
  return cinematicPromise;
}

export function initHeroLauncher(): void {
  // Prevent automatic scroll restoration
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  window.scrollTo(0, 0);

  let opened = false;

  const preventKeys = (e: KeyboardEvent) => {
    if (!opened && ['ArrowDown', 'ArrowUp', 'Space', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.code)) {
      e.preventDefault();
    }
  };

  const preventScroll = (e: Event) => {
    if (!opened) {
      e.preventDefault();
    }
  };

  function lockScroll() {
    document.documentElement.classList.add('scroll-locked');
    document.body.classList.add('scroll-locked');
    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });
    window.addEventListener('keydown', preventKeys, { passive: false });
  }

  function unlockScroll() {
    document.documentElement.classList.remove('scroll-locked');
    document.body.classList.remove('scroll-locked');
    document.body.style.position = '';
    window.removeEventListener('wheel', preventScroll);
    window.removeEventListener('touchmove', preventScroll);
    window.removeEventListener('keydown', preventKeys);
  }

  lockScroll();

  const resetToStart = () => {
    if (!opened) {
      window.scrollTo(0, 0);
      lockScroll();
    }
  };

  window.addEventListener('pageshow', resetToStart);

  const tapBtn = document.getElementById('tap-btn');
  const video = document.getElementById('hero-video') as HTMLVideoElement | null;
  const bgMusic = document.getElementById('bg-music') as HTMLAudioElement | null;

  // Pre-warm on pointerenter or touchstart
  const preWarm = () => {
    prefetchCinematic();
    if (video && !video.src && video.dataset.src) {
      video.src = video.dataset.src;
      video.preload = 'auto';
    }
  };

  tapBtn?.addEventListener('pointerenter', preWarm, { once: true, passive: true });
  tapBtn?.addEventListener('touchstart', preWarm, { once: true, passive: true });

  // Prefetch during idle time so it is completely ready before the user clicks
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => prefetchCinematic(), { timeout: 2000 });
  } else {
    setTimeout(prefetchCinematic, 1200);
  }

  // Handle open — called synchronously from user gesture
  function triggerOpen() {
    if (opened) return;
    opened = true;

    // ── SYNCHRONOUS within user gesture ──
    // These MUST happen before any async boundary to preserve user-activation.

    // 1. Unlock scroll
    unlockScroll();

    // 2. Set media sources synchronously
    if (video && !video.src && video.dataset.src) {
      video.src = video.dataset.src;
    }
    if (bgMusic && !bgMusic.src && bgMusic.dataset.src) {
      bgMusic.src = bgMusic.dataset.src;
    }

    // 3. Start audio IMMEDIATELY — synchronously within user gesture.
    //    This is critical: browsers require .play() to be called in the
    //    same synchronous call stack as the user event. If we await the
    //    dynamic import first, the activation token expires.
    let audioStarted = false;
    if (bgMusic) {
      bgMusic.loop = true;
      const playPromise = bgMusic.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => { audioStarted = true; })
          .catch(() => { /* Will be retried by music toggle */ });
      }
    }

    // 4. Start video playback synchronously within user gesture too.
    //    The cinematic module will coordinate the actual animation.
    let videoPlayStarted = false;
    if (video) {
      video.muted = true;
      video.preload = 'auto';
      const vp = video.play();
      if (vp !== undefined) {
        vp.then(() => { videoPlayStarted = true; })
          .catch(() => { /* Will be handled by cinematic module */ });
      }
    }

    // 5. NOW load the cinematic module (async is fine — media already started)
    prefetchCinematic().then(({ startCinematicExperience }) => {
      startCinematicExperience();
    });
  }

  tapBtn?.addEventListener('click', triggerOpen);
  tapBtn?.addEventListener('touchend', (e) => {
    e.preventDefault();
    triggerOpen();
  }, { passive: false });
  tapBtn?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      triggerOpen();
    }
  });
}
