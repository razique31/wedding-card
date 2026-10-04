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
  setTimeout(() => window.scrollTo(0, 0), 10); // Fallback for some mobile browsers

  // Initialize Lenis and ScrollReveals for the rest of the page
  initMotion();

  // 1. Initial State: Lock scroll until tapped
  if (tapOverlay) {
    getLenis()?.stop();
  }

  // Elements to animate based on scroll
  const textTop = document.getElementById('hero-text-top');
  const textBottom = document.getElementById('hero-text-bottom');
  const scrollContainer = document.getElementById('hero-scroll-container');

  if (!scrollContainer || !heroSection || !video) return;

  // 4. Handle Auto-Play State
  let isAutoPlaying = false;
  let autoPlayTimeout: number;

  function stopAutoPlay() {
    if (!isAutoPlaying) return;
    isAutoPlaying = false;
    clearTimeout(autoPlayTimeout);
  }

  // Handle Tap to Open (Guaranteed instant response and iOS video playback)
  let opened = false;
  function handleOpen() {
    if (!tapOverlay || opened) return;
    opened = true;

    // Immediately trigger video play synchronously inside user gesture for iOS/Safari policy
    if (video) {
      isAutoPlaying = true;
      video.muted = true; // Required by autoplay policies
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Native video autoplay policy blocked:', err);
          isAutoPlaying = false;
        });
      }
    }

    // Unlock scroll
    const lenis = getLenis();
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
    if (queuedProgress === null || !videoReady || !video.duration || isAutoPlaying) return;

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
    if (isAutoPlaying) return; // Do not fight native playback!
    queuedProgress = progress;
    if (!isSeeking) {
      requestAnimationFrame(handleSeek);
    }
  };

  function onVideoReady() {
    videoReady = true;
    video!.pause(); // Ensure it never plays automatically before tap
    try {
      video!.currentTime = 0;
    } catch { /* ignore */ }
  }

  if (video.readyState >= 2) {
    onVideoReady();
  } else {
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
      seekVideo(self.progress);

      // Fade in text as the envelope opens (between 30% and 50% of the cinematic scroll)
      const textOpacity = gsap.utils.clamp(0, 1, gsap.utils.mapRange(0.5, 0.9, 0, 1, self.progress));
      const textY = gsap.utils.clamp(0, 16, gsap.utils.mapRange(0.5, 0.9, 16, 0, self.progress));

      if (textTop && textBottom) {
        textTop.style.opacity = textOpacity.toString();
        textTop.style.transform = `translate3d(0, ${textY}px, 0)`;
        textBottom.style.opacity = textOpacity.toString();
        textBottom.style.transform = `translate3d(0, ${textY}px, 0)`;
      }
    }
  });
}
