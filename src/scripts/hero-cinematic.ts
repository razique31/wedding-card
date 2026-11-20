/**
 * hero-cinematic.ts
 *
 * Unified full-screen cinematic video hero & motion system.
 * Dynamically loaded after user interaction or during browser idle time.
 *
 * 1. Background music starts playing seamlessly in loop.
 * 2. Video plays and scrubs smoothly with GSAP ScrollTrigger.
 * 3. Bouncing scroll-down indicator appears immediately when the video stops playing.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initMotion, getLenis, ensureScrollReveals } from './motion-init';

gsap.registerPlugin(ScrollTrigger);

let cinematicInitialized = false;

export function startCinematicExperience(): void {
  if (cinematicInitialized) return;
  cinematicInitialized = true;

  const heroSection = document.getElementById('hero');
  const video = document.getElementById('hero-video') as HTMLVideoElement | null;
  const tapOverlay = document.getElementById('tap-overlay');
  const heroDastaan = document.getElementById('hero-dastaan');
  const textTop = document.getElementById('hero-text-top');
  const textBottom = document.getElementById('hero-text-bottom');
  const scrollCue = document.getElementById('hero-scroll-cue');
  const scrollContainer = document.getElementById('hero-scroll-container');
  const bgMusic = document.getElementById('bg-music') as HTMLAudioElement | null;
  const musicToggle = document.getElementById('music-toggle');
  const iconPlaying = document.getElementById('music-icon-playing');
  const iconMuted = document.getElementById('music-icon-muted');

  if (!heroSection || !video) return;

  // Ensure scroll is unlocked and snapped to top
  document.documentElement.classList.remove('scroll-locked');
  document.body.classList.remove('scroll-locked');
  document.body.style.position = '';
  window.scrollTo(0, 0);

  let isAutoPlaying = true;
  let videoFinished = false;
  let autoPlayTimeout: number;
  let scrollTriggerCreated = false;

  // 1. Start background music
  if (bgMusic) {
    if (!bgMusic.src && bgMusic.dataset.src) {
      bgMusic.src = bgMusic.dataset.src;
    }
    bgMusic.loop = true;
    const playAudio = bgMusic.play();
    if (playAudio !== undefined) {
      playAudio.catch((err) => {
        console.warn('Background audio playback prevented:', err);
      });
    }
  }

  // 2. Display music toggle button
  if (musicToggle) {
    musicToggle.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-3');
    musicToggle.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
    iconPlaying?.classList.remove('hidden');
    iconMuted?.classList.add('hidden');

    musicToggle.addEventListener('click', () => {
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
  }

  // 3. Initialize motion and Lenis
  initMotion();
  const lenis = getLenis();
  if (lenis) {
    lenis.scrollTo(0, { immediate: true });
    lenis.start();
  }

  // 4. Video scrubbing logic
  let videoReady = false;
  let lastTime = -1;
  let isSeeking = false;
  let queuedProgress: number | null = null;

  function handleSeek() {
    if (queuedProgress === null || !videoReady || !video || !video.duration || isAutoPlaying) return;

    const targetTime = queuedProgress * video.duration;
    queuedProgress = null;

    if (Math.abs(targetTime - lastTime) < 0.033) {
      if (queuedProgress !== null) {
        requestAnimationFrame(handleSeek);
      }
      return;
    }

    lastTime = targetTime;
    isSeeking = true;
    try {
      if ('fastSeek' in video) {
        (video as any).fastSeek(targetTime);
      } else {
        video.currentTime = targetTime;
      }
    } catch {
      isSeeking = false;
    }
  }

  video.addEventListener('seeked', () => {
    isSeeking = false;
    if (queuedProgress !== null) {
      requestAnimationFrame(handleSeek);
    }
  });

  const seekVideo = (progress: number) => {
    if (isAutoPlaying) return;
    queuedProgress = progress;
    if (!isSeeking) {
      requestAnimationFrame(handleSeek);
    }
  };

  function onVideoReady() {
    videoReady = true;
  }

  if (video.readyState >= 1) {
    onVideoReady();
  } else {
    video.addEventListener('loadedmetadata', onVideoReady, { once: true });
  }

  video.addEventListener('error', () => {
    video.style.display = 'none';
  });

  function stopAutoPlay() {
    if (videoFinished) return;
    videoFinished = true;
    isAutoPlaying = false;
    clearTimeout(autoPlayTimeout);

    // Make sure names and wedding details are fully revealed
    if (textTop && textBottom) {
      textTop.style.opacity = '1';
      textTop.style.transform = 'translate3d(0, 0, 0)';
      textBottom.style.opacity = '1';
      textBottom.style.transform = 'translate3d(0, 0, 0)';
    }

    // Reveal bouncing scroll down cue immediately once video stops
    if (scrollCue) {
      scrollCue.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
      scrollCue.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
      scrollCue.style.opacity = '1';
      scrollCue.style.pointerEvents = 'auto';
    }

    ScrollTrigger.refresh();
  }

  // 5. ScrollTrigger setup
  function createHeroScrollTrigger() {
    if (scrollTriggerCreated || !scrollContainer || !heroSection || !video) return;
    scrollTriggerCreated = true;

    ScrollTrigger.create({
      trigger: scrollContainer,
      start: 'top top',
      end: 'bottom bottom',
      pin: heroSection,
      pinSpacing: false,
      scrub: true,
      onUpdate: (self) => {
        seekVideo(self.progress);

        // 1. "Dastaan — your decade-long love story"
        let dastaanOpacity = 0;
        let dastaanY = 14;

        if (self.progress >= 0.30 && self.progress < 0.40) {
          dastaanOpacity = gsap.utils.clamp(0, 1, gsap.utils.mapRange(0.30, 0.40, 0, 1, self.progress));
          dastaanY = gsap.utils.clamp(0, 14, gsap.utils.mapRange(0.30, 0.40, 14, 0, self.progress));
        } else if (self.progress >= 0.40 && self.progress <= 0.44) {
          dastaanOpacity = 1;
          dastaanY = 0;
        } else if (self.progress > 0.44 && self.progress <= 0.50) {
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

        // 2. Names & Wedding Details
        const textOpacity = gsap.utils.clamp(0, 1, gsap.utils.mapRange(0.58, 0.88, 0, 1, self.progress));
        const textY = gsap.utils.clamp(0, 16, gsap.utils.mapRange(0.58, 0.88, 16, 0, self.progress));

        if (textTop && textBottom) {
          textTop.style.opacity = textOpacity.toString();
          textTop.style.transform = `translate3d(0, ${textY}px, 0)`;
          textBottom.style.opacity = textOpacity.toString();
          textBottom.style.transform = `translate3d(0, ${textY}px, 0)`;
        }

        // 3. Scroll Down Cue visibility:
        // Stays visible when video is finished and user is viewing the hero ending.
        // Hides only when user scrolls down past the hero into lower content.
        if (scrollCue && videoFinished) {
          const isPastHero = scrollContainer
            ? window.scrollY > (scrollContainer.offsetHeight - window.innerHeight + 80)
            : false;

          if (isPastHero || self.progress < 0.4) {
            scrollCue.style.opacity = '0';
            scrollCue.style.pointerEvents = 'none';
          } else {
            scrollCue.style.opacity = '1';
            scrollCue.style.pointerEvents = 'auto';
          }
        }
      }
    });
  }

  createHeroScrollTrigger();

  // 6. Start video playback
  video.muted = true;
  if (!video.src && video.dataset.src) {
    video.src = video.dataset.src;
  }
  video.preload = 'auto';
  const playPromise = video.play();
  if (playPromise !== undefined) {
    playPromise.catch((err) => {
      console.warn('Native video autoplay policy blocked:', err);
      stopAutoPlay();
    });
  }

  // 7. Activate scroll reveals
  ensureScrollReveals();

  // 8. Fade out tap overlay
  if (tapOverlay) {
    gsap.to(tapOverlay, {
      autoAlpha: 0,
      duration: 0.6,
      ease: 'power2.out',
      onComplete: () => {
        tapOverlay.style.display = 'none';
      }
    });
  }

  ScrollTrigger.refresh();

  // 9. Auto-scroll Lenis during video play
  if (lenis && scrollContainer && video) {
    const duration = (video.duration && !isNaN(video.duration) && video.duration > 0) ? video.duration : 10;
    const targetScroll = scrollContainer.getBoundingClientRect().top + window.scrollY + scrollContainer.offsetHeight - window.innerHeight;

    lenis.scrollTo(targetScroll, {
      duration: duration,
      easing: (t: number) => t
    });

    // Listen to video finish signals
    video.addEventListener('ended', stopAutoPlay, { once: true });
    
    // Check if video reached within 200ms of end
    const onTimeUpdate = () => {
      const dur = video.duration || 10;
      if (video.currentTime >= dur - 0.25) {
        video.removeEventListener('timeupdate', onTimeUpdate);
        stopAutoPlay();
      }
    };
    video.addEventListener('timeupdate', onTimeUpdate);

    autoPlayTimeout = window.setTimeout(stopAutoPlay, (duration + 0.3) * 1000);

    const interruptHandler = () => {
      stopAutoPlay();
      window.removeEventListener('wheel', interruptHandler);
      window.removeEventListener('touchstart', interruptHandler);
    };
    window.addEventListener('wheel', interruptHandler, { passive: true, once: true });
    window.addEventListener('touchstart', interruptHandler, { passive: true, once: true });
  }

  // 10. Clicking the scroll cue scrolls down smoothly to the countdown section
  scrollCue?.addEventListener('click', () => {
    const lenis = getLenis();
    const countdown = document.getElementById('countdown');
    if (countdown) {
      if (lenis) {
        lenis.scrollTo(countdown, { duration: 1.2 });
      } else {
        countdown.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });
}

// Backwards compatibility export
export function initHeroCinematic(): void {
  import('./hero-launcher').then(({ initHeroLauncher }) => {
    initHeroLauncher();
  });
}
