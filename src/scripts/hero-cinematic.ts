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
    video?.pause();
    clearTimeout(autoPlayTimeout);
  }

  // Handle Tap to Open
  function handleOpen() {
    if (!tapOverlay) return;

    // Unlock scroll
    const lenis = getLenis();
    lenis?.start();

    // Fade out overlay
    gsap.to(tapOverlay, {
      autoAlpha: 0,
      duration: 0.8,
      ease: 'power2.out',
      onComplete: () => {
        tapOverlay.style.display = 'none';
      }
    });

    // Force browser layout update then start native autoplay
    setTimeout(() => {
      ScrollTrigger.refresh();
      
      if (lenis && scrollContainer && video) {
        // Play video natively for true 60fps hardware acceleration!
        isAutoPlaying = true;
        video.play().catch(() => { isAutoPlaying = false; });
        
        // Scroll the page at the exact same speed so the text animations sync perfectly
        const targetScroll = scrollContainer.getBoundingClientRect().top + window.scrollY + scrollContainer.offsetHeight - window.innerHeight;
        
        lenis.scrollTo(targetScroll, {
          duration: video.duration > 0 ? video.duration : 5,
          easing: (t: number) => t
        });

        // Re-enable manual scroll control when finished
        autoPlayTimeout = window.setTimeout(stopAutoPlay, (video.duration > 0 ? video.duration : 5) * 1000);
        
        // If user manually interrupts the scroll (touches screen), stop autoplay and hand control back to them immediately
        window.addEventListener('wheel', stopAutoPlay, { once: true });
        window.addEventListener('touchstart', stopAutoPlay, { once: true });
      }
    }, 50);
  }

  tapBtn?.addEventListener('click', handleOpen);
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
      video!.currentTime = targetTime;
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
        textTop.style.transform = `translateY(${textY}px)`;
        textBottom.style.opacity = textOpacity.toString();
        textBottom.style.transform = `translateY(${textY}px)`;
      }
    }
  });
}
