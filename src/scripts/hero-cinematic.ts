/**
 * hero-cinematic.ts
 *
 * Controls the unified full-screen cinematic video hero.
 * 1. Tap to Open removes overlay and enables scrolling.
 * 2. Scroll position directly controls video.currentTime via GSAP ScrollTrigger.
 * 3. Text layers subtly animate as you scroll but remain visible.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initMotion, getLenis } from './motion-init';

gsap.registerPlugin(ScrollTrigger);




export function initHeroCinematic(): void {
  const heroSection = document.getElementById('hero');
  const pinnedContent = document.getElementById('hero-pinned-content');
  const video = document.getElementById('hero-video') as HTMLVideoElement | null;
  const tapOverlay = document.getElementById('tap-overlay');
  const tapBtn = document.getElementById('tap-btn');
  const scrollCue = document.getElementById('hero-scroll-cue');

  if (!heroSection || !video) return;

  // Force page to always load at the very top (prevent browser from restoring scroll position)
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  if (document.body) document.body.scrollTop = 0;
  setTimeout(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }, 10);

  // Immediately pause and rewind video to frame 0
  video.pause();
  try {
    video.currentTime = 0;
  } catch { /* ignore */ }

  // Initialize Lenis and ScrollReveals for the rest of the page
  initMotion();

  // 1. Initial State: Lock scroll and keep Lenis at 0 until tapped
  const initialLenis = getLenis();
  if (initialLenis) {
    initialLenis.scrollTo(0, { immediate: true });
    if (tapOverlay) {
      initialLenis.stop();
    }
  }

  // Elements to animate based on scroll
  const heroDastaan = document.getElementById('hero-dastaan');
  const textTop = document.getElementById('hero-text-top');
  const textBottom = document.getElementById('hero-text-bottom');
  const scrollContainer = document.getElementById('hero-scroll-container');

  // Background Music Elements
  const bgMusic = document.getElementById('bg-music') as HTMLAudioElement | null;
  const musicToggle = document.getElementById('music-toggle');
  const iconPlaying = document.getElementById('music-icon-playing');
  const iconMuted = document.getElementById('music-icon-muted');

  if (bgMusic) {
    bgMusic.loop = true;
    bgMusic.pause();
    try { bgMusic.currentTime = 0; } catch {}
  }

  if (musicToggle) {
    musicToggle.classList.add('opacity-0', 'pointer-events-none', 'translate-y-3');
    musicToggle.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
  }

  if (tapOverlay) {
    tapOverlay.style.display = 'flex';
    tapOverlay.style.opacity = '1';
    tapOverlay.style.visibility = 'visible';
  }

  if (heroDastaan) {
    heroDastaan.style.opacity = '0';
    heroDastaan.style.transform = 'translate3d(0, 14px, 0)';
  }

  if (textTop && textBottom) {
    textTop.style.opacity = '0';
    textTop.style.transform = 'translate3d(0, 16px, 0)';
    textBottom.style.opacity = '0';
    textBottom.style.transform = 'translate3d(0, 16px, 0)';
  }

  if (!scrollContainer || !heroSection || !video) return;

  let opened = false;

  // Function to ensure complete reset on bfcache / reload
  const resetToStart = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    const l = getLenis();
    if (l) {
      l.scrollTo(0, { immediate: true });
      if (!opened) l.stop();
    }
    if (!opened && video) {
      video.pause();
      try {
        video.currentTime = 0;
      } catch { /* ignore */ }
    }
    if (!opened && heroDastaan) {
      heroDastaan.style.opacity = '0';
      heroDastaan.style.transform = 'translate3d(0, 14px, 0)';
    }
    if (!opened && textTop && textBottom) {
      textTop.style.opacity = '0';
      textTop.style.transform = 'translate3d(0, 16px, 0)';
      textBottom.style.opacity = '0';
      textBottom.style.transform = 'translate3d(0, 16px, 0)';
    }
    if (!opened && bgMusic) {
      bgMusic.pause();
      try {
        bgMusic.currentTime = 0;
      } catch { /* ignore */ }
    }
    if (!opened && musicToggle) {
      musicToggle.classList.add('opacity-0', 'pointer-events-none', 'translate-y-3');
      musicToggle.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
      iconPlaying?.classList.remove('hidden');
      iconMuted?.classList.add('hidden');
    }
  };

  window.addEventListener('pageshow', resetToStart);
  window.addEventListener('load', resetToStart);

  // Music toggle button interaction
  musicToggle?.addEventListener('click', () => {
    if (!bgMusic) return;
    if (bgMusic.paused) {
      bgMusic.play();
      iconPlaying?.classList.remove('hidden');
      iconMuted?.classList.add('hidden');
    } else {
      bgMusic.pause();
      iconPlaying?.classList.add('hidden');
      iconMuted?.classList.remove('hidden');
    }
  });

  // 4. Handle Auto-Play State
  let isAutoPlaying = false;
  let autoPlayTimeout: number;

  function stopAutoPlay() {
    if (!isAutoPlaying) return;
    isAutoPlaying = false;
    clearTimeout(autoPlayTimeout);
    ScrollTrigger.refresh();
  }

  // Handle Tap to Open (Guaranteed instant response and iOS video playback)
  function handleOpen() {
    if (!tapOverlay || opened) return;
    opened = true;

    // Start background music and loop infinitely
    if (bgMusic) {
      bgMusic.loop = true;
      const playAudio = bgMusic.play();
      if (playAudio !== undefined) {
        playAudio.catch((err) => {
          console.warn('Background audio playback prevented:', err);
        });
      }
    }
    if (musicToggle) {
      musicToggle.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-3');
      musicToggle.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
      iconPlaying?.classList.remove('hidden');
      iconMuted?.classList.add('hidden');
    }

    // Reset scroll and video to absolute 0 before playing
    window.scrollTo(0, 0);
    const lenis = getLenis();
    lenis?.scrollTo(0, { immediate: true });

    // Immediately trigger video play synchronously inside user gesture for iOS/Safari policy
    if (video) {
      isAutoPlaying = true;
      video.muted = true; // Required by autoplay policies
      video.currentTime = 0; // Always start from beginning
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Native video autoplay policy blocked:', err);
          isAutoPlaying = false;
        });
      }
    }

    // Unlock scroll
    lenis?.start();

    // Fade out overlay cleanly
    gsap.to(tapOverlay, {
      autoAlpha: 0,
      duration: 0.6,
      ease: 'power2.out',
      onComplete: () => {
        tapOverlay.style.display = 'none';
      }
    });

    // Sync scroll and video playback smoothly
    ScrollTrigger.refresh();

    if (lenis && scrollContainer && video) {
      const duration = (video.duration && !isNaN(video.duration) && video.duration > 0) ? video.duration : 5;
      const targetScroll = scrollContainer.getBoundingClientRect().top + window.scrollY + scrollContainer.offsetHeight - window.innerHeight;

      lenis.scrollTo(targetScroll, {
        duration: duration,
        easing: (t: number) => t
      });

      // Stop autoplay once video ends or duration elapses
      video.addEventListener('ended', stopAutoPlay, { once: true });
      autoPlayTimeout = window.setTimeout(stopAutoPlay, duration * 1000);

      // If user touches or wheels during autoplay, instantly grant them manual control
      const interruptHandler = () => {
        stopAutoPlay();
        window.removeEventListener('wheel', interruptHandler);
        window.removeEventListener('touchstart', interruptHandler);
      };
      window.addEventListener('wheel', interruptHandler, { passive: true, once: true });
      window.addEventListener('touchstart', interruptHandler, { passive: true, once: true });
    }
  }

  tapBtn?.addEventListener('click', handleOpen);
  tapBtn?.addEventListener('touchend', (e) => {
    e.preventDefault();
    handleOpen();
  }, { passive: false });
  tapBtn?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleOpen();
    }
  });

  video.addEventListener('error', () => {
    video.style.display = 'none'; // Poster fallback stays
  });

  // 3. Scrub Video with ScrollTrigger (Performance Optimized)
  let videoReady = false;
  let lastTime = -1;
  let isSeeking = false;
  let queuedProgress: number | null = null;

  function handleSeek() {
    if (!opened || queuedProgress === null || !videoReady || !video.duration || isAutoPlaying) return;

    const targetTime = queuedProgress * video.duration;
    queuedProgress = null; // Clear queue

    // Skip if difference is negligible (less than ~1 frame at 30fps)
    if (Math.abs(targetTime - lastTime) < 0.033) {
      if (queuedProgress !== null) {
        requestAnimationFrame(handleSeek);
      }
      return;
    }

    lastTime = targetTime;
    isSeeking = true;
    try {
      if ('fastSeek' in video!) {
        (video as any).fastSeek(targetTime);
      } else {
        video!.currentTime = targetTime;
      }
    } catch {
      isSeeking = false;
    }
  }

  video.addEventListener('seeked', () => {
    isSeeking = false;
    if (queuedProgress !== null) {
      // Use rAF to avoid microtask blockage
      requestAnimationFrame(handleSeek);
    }
  });

  const seekVideo = (progress: number) => {
    if (!opened || isAutoPlaying) return; // Do not fight native playback or seek before opened!
    queuedProgress = progress;
    if (!isSeeking) {
      requestAnimationFrame(handleSeek);
    }
  };

  function onVideoReady() {
    videoReady = true;
    if (!opened) {
      video!.pause(); // Ensure it never plays automatically before tap
      try {
        video!.currentTime = 0;
      } catch { /* ignore */ }
    }
  }

  if (video.readyState >= 2) {
    onVideoReady();
  } else {
    video.addEventListener('loadedmetadata', onVideoReady, { once: true });
    video.addEventListener('loadeddata', onVideoReady, { once: true });
    video.addEventListener('canplay', onVideoReady, { once: true });
  }

  // Create the ScrollTrigger to map progress to video
  ScrollTrigger.create({
    trigger: scrollContainer,
    start: 'top top',
    end: 'bottom bottom', // Ends after the 600vh scroll container finishes
    pin: heroSection,
    pinSpacing: false, // Prevents GSAP from generating a pin-spacer wrapper that causes layout shifts
    scrub: true, // Let ScrollTrigger handle the scrub directly
    onUpdate: (self) => {
      if (!opened) {
        // While unopened, keep video at 0 and all text hidden
        if (video && video.currentTime !== 0) {
          try { video.currentTime = 0; } catch { }
        }
        if (heroDastaan) {
          heroDastaan.style.opacity = '0';
        }
        if (textTop && textBottom) {
          textTop.style.opacity = '0';
          textBottom.style.opacity = '0';
        }
        return;
      }

      seekVideo(self.progress);

      // 1. "Dastaan — your decade-long love story":
      // Appears before the names, holds gracefully, and disappears just before the names appear
      let dastaanOpacity = 0;
      let dastaanY = 14;

      if (self.progress >= 0.30 && self.progress < 0.40) {
        // Fade in
        dastaanOpacity = gsap.utils.clamp(0, 1, gsap.utils.mapRange(0.30, 0.40, 0, 1, self.progress));
        dastaanY = gsap.utils.clamp(0, 14, gsap.utils.mapRange(0.30, 0.40, 14, 0, self.progress));
      } else if (self.progress >= 0.40 && self.progress <= 0.44) {
        // Hold visible in center
        dastaanOpacity = 1;
        dastaanY = 0;
      } else if (self.progress > 0.44 && self.progress <= 0.50) {
        // Fade out
        dastaanOpacity = gsap.utils.clamp(0, 1, gsap.utils.mapRange(0.44, 0.56, 1, 0, self.progress));
        dastaanY = gsap.utils.clamp(-14, 0, gsap.utils.mapRange(0.44, 0.56, 0, -14, self.progress));
      } else {
        dastaanOpacity = 0;
        dastaanY = self.progress < 0.12 ? 14 : -14;
      }

      if (heroDastaan) {
        heroDastaan.style.opacity = dastaanOpacity.toString();
        heroDastaan.style.transform = `translate3d(0, ${dastaanY}px, 0)`;
      }

      // 2. Names & Wedding Details:
      // Fade in just after Dastaan dissolves away (from 0.58 to 0.88)
      const textOpacity = gsap.utils.clamp(0, 1, gsap.utils.mapRange(0.58, 0.88, 0, 1, self.progress));
      const textY = gsap.utils.clamp(0, 16, gsap.utils.mapRange(0.58, 0.88, 16, 0, self.progress));

      if (textTop && textBottom) {
        textTop.style.opacity = textOpacity.toString();
        textTop.style.transform = `translate3d(0, ${textY}px, 0)`;
        textBottom.style.opacity = textOpacity.toString();
        textBottom.style.transform = `translate3d(0, ${textY}px, 0)`;
      }
    }
  });
}
