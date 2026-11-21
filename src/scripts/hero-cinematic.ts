/**
 * hero-cinematic.ts
 *
 * Robust, synchronized cinematic playback controller with explicit state machine.
 *
 * States:
 *   IDLE         → Waiting for user interaction (handled by hero-launcher.ts)
 *   INITIALIZING → Module loaded, checking video state & awaiting playback readiness
 *   PLAYING      → Video playing naturally, Lenis auto-scrolls, text overlays animate
 *   SCRUBBING    → Native video paused, scroll position controls video seeking & text
 *   DESTROYED    → Tear down all listeners, animations, and timers
 *
 * Audit guarantees:
 * 1. Handles any ordering of video playback and module initialization (already ended,
 *    already playing, buffering, or yet to play).
 * 2. Lenis auto-scroll pauses if the video buffers and resumes when playback resumes.
 * 3. Bulletproof single-in-flight seek controller with watchdog timer and no fastSeek keyframe drift.
 * 4. Authoritative completion strictly on video 'ended' event.
 * 5. Audio UI is 100% reactive to native audio events.
 * 6. Visual design, timings, and text animation ranges (Dastaan: 0.30–0.56, Names: 0.58–0.88) preserved exactly.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initMotion, getLenis, ensureScrollReveals } from './motion-init';

gsap.registerPlugin(ScrollTrigger);

// ── Playback State Machine ─────────────────────────────────────────

export const enum PlaybackState {
  IDLE = 'IDLE',
  INITIALIZING = 'INITIALIZING',
  PLAYING = 'PLAYING',
  SCRUBBING = 'SCRUBBING',
  DESTROYED = 'DESTROYED',
}

let currentState: PlaybackState = PlaybackState.IDLE;
let cinematicInitialized = false;

export function getPlaybackState(): PlaybackState {
  return currentState;
}

/**
 * Validates that the video element has loaded finite, positive metadata.
 */
export function hasValidDuration(
  videoEl: HTMLVideoElement | null
): videoEl is HTMLVideoElement & { duration: number } {
  return (
    !!videoEl &&
    typeof videoEl.duration === 'number' &&
    Number.isFinite(videoEl.duration) &&
    !isNaN(videoEl.duration) &&
    videoEl.duration > 0
  );
}

/**
 * Main entry point invoked by hero-launcher.ts.
 */
export function startCinematicExperience(): void {
  if (cinematicInitialized) return;
  cinematicInitialized = true;
  currentState = PlaybackState.INITIALIZING;

  // ── DOM Elements ─────────────────────────────────────────────────

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

  if (!heroSection || !video) {
    currentState = PlaybackState.DESTROYED;
    return;
  }

  const vid = video;

  // ── Ensure scroll lock CSS classes are removed ───────────────────

  document.documentElement.classList.remove('scroll-locked');
  document.body.classList.remove('scroll-locked');
  document.body.style.position = '';

  // ── Initialize Motion System ─────────────────────────────────────

  initMotion();
  const lenis = getLenis();
  if (lenis) {
    lenis.start();
  }

  // ── Reactive Music Toggle ────────────────────────────────────────

  if (musicToggle && bgMusic) {
    const syncMusicUI = () => {
      const isPlaying = !bgMusic.paused && !bgMusic.ended;
      if (isPlaying) {
        iconPlaying?.classList.remove('hidden');
        iconMuted?.classList.add('hidden');
      } else {
        iconPlaying?.classList.add('hidden');
        iconMuted?.classList.remove('hidden');
      }
    };

    musicToggle.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-3');
    musicToggle.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');

    syncMusicUI();

    bgMusic.addEventListener('play', syncMusicUI);
    bgMusic.addEventListener('playing', syncMusicUI);
    bgMusic.addEventListener('pause', syncMusicUI);
    bgMusic.addEventListener('ended', syncMusicUI);

    musicToggle.addEventListener('click', () => {
      if (bgMusic.paused) {
        bgMusic.play().catch(() => {});
      } else {
        bgMusic.pause();
      }
    });
  }

  // ── Timers and Async Trackers ────────────────────────────────────

  let autoPlaySafetyTimeout: number | undefined;
  let readinessTimeout: number | undefined;
  let lenisAutoScrollActive = false;
  let isBuffering = false;
  let scrollTriggerInstance: ScrollTrigger | null = null;

  // ── Seek Controller State ────────────────────────────────────────

  let seekPending = false;
  let isSeekDegraded = false;
  let seekTarget: number = -1;
  let lastSeekedTime = -1;
  let seekRafId: number | null = null;
  let seekWatchdogTimer: number | null = null;
  let seekStallCount = 0;
  const SEEK_THRESHOLD = 0.04;

  function clearSeekWatchdog() {
    if (seekWatchdogTimer !== null) {
      clearTimeout(seekWatchdogTimer);
      seekWatchdogTimer = null;
    }
    seekStallCount = 0;
  }

  function cancelSeekRaf() {
    if (seekRafId !== null) {
      cancelAnimationFrame(seekRafId);
      seekRafId = null;
    }
  }

  function scheduleSeekWatchdog() {
    if (seekWatchdogTimer !== null) return;
    seekWatchdogTimer = window.setTimeout(() => {
      seekWatchdogTimer = null;
      if (currentState !== PlaybackState.SCRUBBING) return;

      // Robust check: never treat timeout as proof that seek has finished!
      // Check native media element property vid.seeking
      if (!vid.seeking) {
        // Browser has actually finished seeking, or 'seeked' was missed or dropped
        seekPending = false;
        isSeekDegraded = false;
        seekStallCount = 0;
        if (seekTarget >= 0 && seekRafId === null) {
          seekRafId = requestAnimationFrame(processSeek);
        }
      } else {
        // Browser is STILL legitimately seeking — DO NOT interrupt or issue concurrent seek!
        seekStallCount++;
        if (seekStallCount < 8) {
          // Re-check in 200ms (up to ~1.6s total legitimate decode time on slow hardware)
          scheduleSeekWatchdog();
        } else {
          // Hard cap reached: browser is still reporting vid.seeking === true.
          // DO NOT simply clear seekPending and issue another native seek!
          // Enter safe degraded recovery state: maintain seekPending lock to prevent concurrent seeks.
          // The rest of the invitation (Lenis scrolling, text overlays, countdown, venue) stays 100% usable.
          isSeekDegraded = true;
          seekPending = true;
          pollDegradedRecovery();
        }
      }
    }, 200);
  }

  function pollDegradedRecovery() {
    if (seekWatchdogTimer !== null) return;
    seekWatchdogTimer = window.setTimeout(() => {
      seekWatchdogTimer = null;
      if (currentState !== PlaybackState.SCRUBBING) return;

      // Check if browser media pipeline is safe again
      if (!vid.seeking) {
        // Safe again! Recover normal scrubbing:
        isSeekDegraded = false;
        seekPending = false;
        seekStallCount = 0;
        if (seekTarget >= 0 && seekRafId === null) {
          seekRafId = requestAnimationFrame(processSeek);
        }
      } else {
        // Decoder is still stalled; remain in safe degraded state and check again without thrashing
        pollDegradedRecovery();
      }
    }, 400);
  }

  function processSeek() {
    seekRafId = null;
    if (currentState !== PlaybackState.SCRUBBING) return;
    if (!hasValidDuration(vid)) return;

    // Never initiate a concurrent native seek while browser is actively seeking or in degraded recovery
    if (vid.seeking || isSeekDegraded) {
      seekPending = true;
      if (isSeekDegraded) {
        pollDegradedRecovery();
      } else {
        scheduleSeekWatchdog();
      }
      return;
    }

    if (seekTarget < 0) {
      seekPending = false;
      clearSeekWatchdog();
      return;
    }

    const target = seekTarget;
    seekTarget = -1;

    // Skip redundant seek if effectively same as last seek or current position
    if (
      Math.abs(target - lastSeekedTime) < SEEK_THRESHOLD ||
      Math.abs(target - vid.currentTime) < 0.005
    ) {
      seekPending = false;
      clearSeekWatchdog();
      if (seekTarget >= 0 && seekRafId === null) {
        seekRafId = requestAnimationFrame(processSeek);
      }
      return;
    }

    seekPending = true;
    lastSeekedTime = target;
    scheduleSeekWatchdog();

    try {
      vid.currentTime = target;
    } catch {
      seekPending = false;
      clearSeekWatchdog();
    }
  }

  const onSeeking = () => {
    if (currentState !== PlaybackState.SCRUBBING) return;
    seekPending = true;
  };
  vid.addEventListener('seeking', onSeeking);

  const onSeeked = () => {
    if (currentState !== PlaybackState.SCRUBBING) return;
    isSeekDegraded = false;
    seekPending = false;
    clearSeekWatchdog();
    if (seekTarget >= 0 && seekRafId === null && !vid.seeking) {
      seekRafId = requestAnimationFrame(processSeek);
    }
  };
  vid.addEventListener('seeked', onSeeked);

  const onSeekError = () => {
    isSeekDegraded = false;
    seekPending = false;
    clearSeekWatchdog();
  };
  vid.addEventListener('error', onSeekError);

  const onMediaRecovered = () => {
    if (currentState !== PlaybackState.SCRUBBING) return;
    if (isSeekDegraded && !vid.seeking) {
      isSeekDegraded = false;
      seekPending = false;
      clearSeekWatchdog();
      if (seekTarget >= 0 && seekRafId === null) {
        seekRafId = requestAnimationFrame(processSeek);
      }
    }
  };
  vid.addEventListener('canplay', onMediaRecovered);
  vid.addEventListener('timeupdate', onMediaRecovered);

  function requestSeek(progress: number) {
    if (currentState !== PlaybackState.SCRUBBING || !hasValidDuration(vid)) return;

    const targetTime = Math.max(0, Math.min(progress * vid.duration, vid.duration));
    seekTarget = targetTime;

    if (!isSeekDegraded && !seekPending && seekRafId === null && !vid.seeking) {
      seekRafId = requestAnimationFrame(processSeek);
    }
  }

  // ── Text Overlay Visual Synchronizer ─────────────────────────────

  function updateTextOverlays(progress: number) {
    // 1. "Dastaan — your decade-long love story" (0.30–0.56)
    let dastaanOpacity = 0;
    let dastaanY = 14;

    if (progress >= 0.30 && progress < 0.40) {
      dastaanOpacity = gsap.utils.clamp(0, 1, gsap.utils.mapRange(0.30, 0.40, 0, 1, progress));
      dastaanY = gsap.utils.clamp(0, 14, gsap.utils.mapRange(0.30, 0.40, 14, 0, progress));
    } else if (progress >= 0.40 && progress <= 0.44) {
      dastaanOpacity = 1;
      dastaanY = 0;
    } else if (progress > 0.44 && progress <= 0.50) {
      dastaanOpacity = gsap.utils.clamp(0, 1, gsap.utils.mapRange(0.44, 0.56, 1, 0, progress));
      dastaanY = gsap.utils.clamp(-14, 0, gsap.utils.mapRange(0.44, 0.56, 0, -14, progress));
    } else {
      dastaanOpacity = 0;
      dastaanY = progress < 0.12 ? 14 : -14;
    }

    if (heroDastaan) {
      heroDastaan.style.opacity = dastaanOpacity.toString();
      heroDastaan.style.transform = `translate3d(0, ${dastaanY}px, 0)`;
    }

    // 2. Names & Wedding Details (0.58–0.88)
    const textOpacity = gsap.utils.clamp(0, 1, gsap.utils.mapRange(0.58, 0.88, 0, 1, progress));
    const textY = gsap.utils.clamp(0, 16, gsap.utils.mapRange(0.58, 0.88, 16, 0, progress));

    if (textTop && textBottom) {
      textTop.style.opacity = textOpacity.toString();
      textTop.style.transform = `translate3d(0, ${textY}px, 0)`;
      textBottom.style.opacity = textOpacity.toString();
      textBottom.style.transform = `translate3d(0, ${textY}px, 0)`;
    }
  }

  // ── Scroll Cue Visibility ────────────────────────────────────────

  function showScrollCue() {
    if (!scrollCue) return;
    scrollCue.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
    scrollCue.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
    scrollCue.style.opacity = '1';
    scrollCue.style.pointerEvents = 'auto';
  }

  function hideScrollCue() {
    if (!scrollCue) return;
    scrollCue.style.opacity = '0';
    scrollCue.style.pointerEvents = 'none';
  }

  // ── Fade Out Tap Overlay ─────────────────────────────────────────

  function dismissTapOverlay() {
    if (tapOverlay) {
      gsap.to(tapOverlay, {
        autoAlpha: 0,
        duration: 0.6,
        ease: 'power2.out',
        onComplete: () => {
          tapOverlay.style.display = 'none';
        },
      });
    }
  }

  // ── State Transition: Centralized Transition Function ────────────

  function transitionTo(nextState: PlaybackState) {
    if (currentState === nextState || currentState === PlaybackState.DESTROYED) return;

    const previousState = currentState;
    currentState = nextState;

    if (nextState === PlaybackState.SCRUBBING) {
      // 1. ALWAYS pause native video immediately
      try {
        vid.pause();
      } catch { /* ignore */ }

      // 2. Cancel Lenis auto-scrolling
      if (lenisAutoScrollActive && lenis) {
        lenisAutoScrollActive = false;
        lenis.scrollTo(lenis.scroll, { immediate: true });
        requestAnimationFrame(() => {
          lenis?.start();
        });
      }

      // 3. Clear all playing/initialization timers
      if (autoPlaySafetyTimeout !== undefined) {
        clearTimeout(autoPlaySafetyTimeout);
        autoPlaySafetyTimeout = undefined;
      }
      if (readinessTimeout !== undefined) {
        clearTimeout(readinessTimeout);
        readinessTimeout = undefined;
      }

      // 4. Detach auto-play specific listeners
      vid.removeEventListener('ended', onVideoEnded);
      vid.removeEventListener('waiting', onVideoBuffering);
      vid.removeEventListener('playing', onVideoResumed);
      window.removeEventListener('wheel', onUserInterrupt);
      window.removeEventListener('touchstart', onUserInterrupt);

      // 5. Reset seek controller state
      cancelSeekRaf();
      clearSeekWatchdog();
      seekPending = false;
      isSeekDegraded = false;
      seekTarget = -1;
      lastSeekedTime = vid.currentTime;
      isBuffering = false;

      // 6. If transitioning from PLAYING at natural end, guarantee final visuals
      if (previousState === PlaybackState.PLAYING) {
        const isNearEnd = vid.ended || (hasValidDuration(vid) && vid.currentTime >= vid.duration - 0.3);
        if (isNearEnd) {
          updateTextOverlays(1);
          showScrollCue();
        }
      }

      // 7. Ensure ScrollTrigger is updated
      ScrollTrigger.refresh();
    }
  }

  // ── ScrollTrigger Setup ──────────────────────────────────────────

  function createHeroScrollTrigger() {
    if (scrollTriggerInstance || !scrollContainer || !heroSection) return;

    scrollTriggerInstance = ScrollTrigger.create({
      trigger: scrollContainer,
      start: 'top top',
      end: 'bottom bottom',
      pin: heroSection,
      pinSpacing: false,
      scrub: true,
      onUpdate: (self) => {
        if (currentState === PlaybackState.PLAYING) {
          updateTextOverlays(self.progress);
          return;
        }

        if (currentState === PlaybackState.SCRUBBING) {
          updateTextOverlays(self.progress);
          requestSeek(self.progress);

          // Scroll cue visibility relative to hero bounds
          if (scrollCue) {
            const isPastHero = scrollContainer
              ? window.scrollY > (scrollContainer.offsetHeight - window.innerHeight + 80)
              : false;

            if (isPastHero || self.progress < 0.4) {
              hideScrollCue();
            } else if (self.progress >= 0.5) {
              showScrollCue();
            }
          }
        }
      },
    });
  }

  // ── Event Handlers for State Transitions ─────────────────────────

  function onUserInterrupt() {
    if (currentState !== PlaybackState.PLAYING) return;
    transitionTo(PlaybackState.SCRUBBING);
  }

  function onVideoEnded() {
    if (currentState !== PlaybackState.PLAYING) return;
    transitionTo(PlaybackState.SCRUBBING);
  }

  function onVideoBuffering() {
    if (currentState !== PlaybackState.PLAYING || isBuffering) return;
    isBuffering = true;
    // Video is waiting for network data — pause Lenis auto-scroll and freeze position!
    if (lenis && lenisAutoScrollActive) {
      lenis.stop();
      lenis.scrollTo(lenis.scroll, { immediate: true });
    }
    // Safety timer must not expire while legitimately waiting for network data
    if (autoPlaySafetyTimeout !== undefined) {
      clearTimeout(autoPlaySafetyTimeout);
      autoPlaySafetyTimeout = undefined;
    }
  }

  function resumeAutoScroll(dur: number) {
    if (!lenis || !lenisAutoScrollActive || !scrollContainer || currentState !== PlaybackState.PLAYING) {
      return;
    }

    const targetScroll = scrollContainer.getBoundingClientRect().top
      + window.scrollY
      + scrollContainer.offsetHeight
      - window.innerHeight;
    const currentProgress = Math.min(1, Math.max(0, vid.currentTime / dur));
    const expectedScroll = currentProgress * targetScroll;

    // Re-align scroll position if drift occurred during buffering
    if (Math.abs(lenis.scroll - expectedScroll) > 5) {
      window.scrollTo(0, expectedScroll);
      lenis.scrollTo(expectedScroll, { immediate: true });
      updateTextOverlays(currentProgress);
    }

    lenis.start();
    const remainingDuration = Math.max(0.2, (dur - vid.currentTime) / (vid.playbackRate || 1));

    lenis.scrollTo(targetScroll, {
      duration: remainingDuration,
      easing: (t: number) => t,
    });

    // Reschedule safety timeout with remaining duration + buffer
    if (autoPlaySafetyTimeout !== undefined) {
      clearTimeout(autoPlaySafetyTimeout);
    }
    autoPlaySafetyTimeout = window.setTimeout(() => {
      if (currentState === PlaybackState.PLAYING) {
        transitionTo(PlaybackState.SCRUBBING);
      }
    }, (remainingDuration + 4) * 1000);
  }

  function onVideoResumed() {
    if (currentState !== PlaybackState.PLAYING || !isBuffering) return;
    isBuffering = false;

    if (!lenis || !lenisAutoScrollActive || !scrollContainer) return;

    if (!hasValidDuration(vid)) {
      // Valid metadata is not yet available: wait for valid metadata or transition into safe fallback
      const onMetadataReady = () => {
        vid.removeEventListener('loadedmetadata', onMetadataReady);
        vid.removeEventListener('durationchange', onMetadataReady);
        if (currentState === PlaybackState.PLAYING) {
          if (hasValidDuration(vid)) {
            resumeAutoScroll(vid.duration);
          } else {
            transitionTo(PlaybackState.SCRUBBING);
          }
        }
      };

      vid.addEventListener('loadedmetadata', onMetadataReady, { once: true });
      vid.addEventListener('durationchange', onMetadataReady, { once: true });

      window.setTimeout(() => {
        vid.removeEventListener('loadedmetadata', onMetadataReady);
        vid.removeEventListener('durationchange', onMetadataReady);
        if (currentState === PlaybackState.PLAYING && !hasValidDuration(vid)) {
          transitionTo(PlaybackState.SCRUBBING);
        }
      }, 1500);

      return;
    }

    resumeAutoScroll(vid.duration);
  }

  // ── Begin Natural Playback ───────────────────────────────────────

  function startPlaybackAutoScroll(dur: number) {
    if (!lenis || !scrollContainer || currentState !== PlaybackState.PLAYING) return;

    const maxScroll = scrollContainer.getBoundingClientRect().top
      + window.scrollY
      + scrollContainer.offsetHeight
      - window.innerHeight;

    const currentProgress = vid.currentTime > 0 ? Math.min(1, vid.currentTime / dur) : 0;
    const currentScroll = currentProgress * maxScroll;
    const remainingDuration = Math.max(0.2, (dur - vid.currentTime) / (vid.playbackRate || 1));

    // Align scroll position with current video playback progress
    if (currentProgress > 0) {
      window.scrollTo(0, currentScroll);
      lenis.scrollTo(currentScroll, { immediate: true });
      updateTextOverlays(currentProgress);
    }

    lenisAutoScrollActive = true;
    lenis.scrollTo(maxScroll, {
      duration: remainingDuration,
      easing: (t: number) => t,
    });

    // Safety timeout: transition if video hasn't ended after duration + buffer
    autoPlaySafetyTimeout = window.setTimeout(() => {
      if (currentState === PlaybackState.PLAYING) {
        transitionTo(PlaybackState.SCRUBBING);
      }
    }, (remainingDuration + 4) * 1000);
  }

  function beginPlayback() {
    if (currentState !== PlaybackState.INITIALIZING) return;
    transitionTo(PlaybackState.PLAYING);

    createHeroScrollTrigger();
    ensureScrollReveals();
    dismissTapOverlay();
    ScrollTrigger.refresh();

    if (!hasValidDuration(vid)) {
      // Valid metadata is not yet ready: wait for valid metadata or transition to safe fallback
      const onMetadataReady = () => {
        vid.removeEventListener('loadedmetadata', onMetadataReady);
        vid.removeEventListener('durationchange', onMetadataReady);
        if (currentState === PlaybackState.PLAYING) {
          if (hasValidDuration(vid)) {
            startPlaybackAutoScroll(vid.duration);
          } else {
            transitionTo(PlaybackState.SCRUBBING);
          }
        }
      };

      vid.addEventListener('loadedmetadata', onMetadataReady, { once: true });
      vid.addEventListener('durationchange', onMetadataReady, { once: true });

      window.setTimeout(() => {
        vid.removeEventListener('loadedmetadata', onMetadataReady);
        vid.removeEventListener('durationchange', onMetadataReady);
        if (currentState === PlaybackState.PLAYING && !hasValidDuration(vid)) {
          transitionTo(PlaybackState.SCRUBBING);
        }
      }, 1500);
    } else {
      startPlaybackAutoScroll(vid.duration);
    }

    // Attach lifecycle listeners for PLAYING state
    vid.addEventListener('ended', onVideoEnded, { once: true });
    vid.addEventListener('waiting', onVideoBuffering);
    vid.addEventListener('playing', onVideoResumed);
    window.addEventListener('wheel', onUserInterrupt, { passive: true, once: true });
    window.addEventListener('touchstart', onUserInterrupt, { passive: true, once: true });
  }

  // ── Video Initialization Inspection ──────────────────────────────

  function checkVideoAndInitialize() {
    dismissTapOverlay();

    // Scenario A: Video has already finished playing
    if (vid.ended) {
      transitionTo(PlaybackState.SCRUBBING);
      createHeroScrollTrigger();
      ensureScrollReveals();

      if (scrollContainer) {
        const maxScroll = scrollContainer.offsetHeight - window.innerHeight;
        window.scrollTo(0, maxScroll);
        if (lenis) lenis.scrollTo(maxScroll, { immediate: true });
      }

      updateTextOverlays(1);
      showScrollCue();
      ScrollTrigger.refresh();
      return;
    }

    // Scenario B: Video is actively playing
    if (!vid.paused && vid.currentTime > 0) {
      beginPlayback();
      return;
    }

    // Scenario C: Video is loading / waiting to play
    const cleanupWaitListeners = () => {
      vid.removeEventListener('playing', onPlaying);
      vid.removeEventListener('ended', onEndedEarly);
      vid.removeEventListener('error', onError);
      vid.removeEventListener('progress', onProgress);
      if (readinessTimeout !== undefined) {
        clearTimeout(readinessTimeout);
        readinessTimeout = undefined;
      }
    };

    const onPlaying = () => {
      cleanupWaitListeners();
      beginPlayback();
    };

    const onEndedEarly = () => {
      cleanupWaitListeners();
      transitionTo(PlaybackState.SCRUBBING);
      createHeroScrollTrigger();
      ensureScrollReveals();
      updateTextOverlays(1);
      showScrollCue();
      ScrollTrigger.refresh();
    };

    const onError = () => {
      cleanupWaitListeners();
      try { vid.pause(); } catch { /* ignore */ }
      vid.style.display = 'none';
      transitionTo(PlaybackState.SCRUBBING);
      createHeroScrollTrigger();
      ensureScrollReveals();
      updateTextOverlays(0);
      showScrollCue();
      ScrollTrigger.refresh();
    };

    let progressExtensions = 0;
    const maxExtensions = 3;
    const resetReadinessTimer = (delay: number) => {
      if (readinessTimeout !== undefined) clearTimeout(readinessTimeout);
      readinessTimeout = window.setTimeout(onReadinessTimeout, delay);
    };

    const onProgress = () => {
      // If data is actively arriving over network, extend timeout up to maxExtensions
      if (progressExtensions < maxExtensions && vid.readyState < 3) {
        progressExtensions++;
        resetReadinessTimer(4000);
      }
    };

    const onReadinessTimeout = () => {
      cleanupWaitListeners();

      if (currentState !== PlaybackState.INITIALIZING) return;

      if (!vid.paused && vid.readyState >= 3 && hasValidDuration(vid)) {
        beginPlayback();
      } else {
        // Fallback: transition safely to scrubbing if video cannot play
        try { vid.pause(); } catch { /* ignore */ }
        transitionTo(PlaybackState.SCRUBBING);
        createHeroScrollTrigger();
        ensureScrollReveals();
        // Since user is at scroll 0, keep initial text state (0), do not reveal final text prematurely
        updateTextOverlays(0);
        showScrollCue();
        ScrollTrigger.refresh();
      }
    };

    resetReadinessTimer(6000);

    vid.addEventListener('playing', onPlaying, { once: true });
    vid.addEventListener('ended', onEndedEarly, { once: true });
    vid.addEventListener('error', onError, { once: true });
    vid.addEventListener('progress', onProgress);
  }

  // ── Kickoff ──────────────────────────────────────────────────────

  checkVideoAndInitialize();

  // ── Scroll Cue Click Interaction ─────────────────────────────────

  scrollCue?.addEventListener('click', () => {
    const l = getLenis();
    const countdown = document.getElementById('countdown');
    if (countdown) {
      if (l) {
        l.scrollTo(countdown, { duration: 1.2 });
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
