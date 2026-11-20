/**
 * hero-launcher.ts
 *
 * Ultra-lightweight initial launcher (~1KB).
 * Executes immediately on page load without importing GSAP, ScrollTrigger, or Lenis.
 * 1. Enforces strict scroll lock and zero scroll restoration before user interaction.
 * 2. Idle-prefetches the heavy cinematic module (GSAP + ScrollTrigger + Lenis) during idle time.
 * 3. Pre-warms video on hover/touchstart.
 * 4. On seal tap/click, dynamically loads and executes the full cinematic experience.
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
    opened = true;
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

  // Handle open
  async function triggerOpen() {
    if (opened) return;
    unlockScroll();

    // Prepare video & audio sources
    if (video && !video.src && video.dataset.src) {
      video.src = video.dataset.src;
    }
    if (bgMusic && !bgMusic.src && bgMusic.dataset.src) {
      bgMusic.src = bgMusic.dataset.src;
    }

    const { startCinematicExperience } = await prefetchCinematic();
    startCinematicExperience();
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
