/**
 * motion-init.ts — Centralized motion system
 *
 * Initializes Lenis smooth scrolling + GSAP ScrollTrigger
 * for the invitation content (called AFTER cinematic opening).
 *
 * Graceful degradation:
 * - Lenis failure → native scrolling works
 * - GSAP failure → has-motion never set → [data-reveal] visible by default
 * - Reduced motion → no Lenis, no scroll animations
 */

import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initScrollReveals } from './scroll-reveals';

gsap.registerPlugin(ScrollTrigger);
gsap.defaults({ ease: 'power3.out', duration: 0.85 });

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let lenis: Lenis | null = null;
let ctx: gsap.Context | null = null;
let tickerUpdate: ((time: number) => void) | null = null;
let initialized = false;

/**
 * Initialize the complete motion system.
 * Safe to call once — subsequent calls are no-ops.
 */
export function initMotion(): void {
  if (initialized) return;
  initialized = true;

  try {
    cleanup();
    document.documentElement.classList.add('has-motion');

    if (!REDUCED_MOTION) {
      try {
        lenis = new Lenis({
          lerp: 0.09,
          smoothWheel: true,
          wheelMultiplier: 0.85,
          touchMultiplier: 1.8,
        });

        // Sync Lenis scroll with GSAP ScrollTrigger
        lenis.on('scroll', ScrollTrigger.update);

        // Synchronize Lenis with GSAP's internal ticker for true zero-stutter frame alignment
        tickerUpdate = (time: number) => {
          lenis?.raf(time * 1000);
        };
        gsap.ticker.add(tickerUpdate);
        gsap.ticker.lagSmoothing(0);
      } catch (lenisErr) {
        console.warn('Lenis init failed, using native scroll:', lenisErr);
        lenis = null;
      }
    }

    // GSAP context for scoped cleanup
    ctx = gsap.context(() => {
      if (!REDUCED_MOTION) {
        initScrollReveals();
      } else {
        // Reduced motion: reveal everything immediately
        document.querySelectorAll<HTMLElement>('[data-reveal]').forEach(el => {
          el.style.visibility = 'visible';
          el.style.opacity = '1';
        });
        // SVG paths: fully drawn
        document.querySelectorAll<HTMLElement>('[data-draw]').forEach(el => {
          el.style.strokeDasharray = 'none';
          el.style.strokeDashoffset = '0';
        });
      }
    });

    // Refresh after all assets loaded
    window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });

  } catch (error) {
    console.error('Motion system failed:', error);
    document.documentElement.classList.remove('has-motion');
    // Make everything visible
    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach(el => {
      el.style.visibility = 'visible';
    });
  }
}

export function cleanup(): void {
  ctx?.revert();
  ctx = null;
  ScrollTrigger.getAll().forEach(t => t.kill());
  if (tickerUpdate) {
    gsap.ticker.remove(tickerUpdate);
    tickerUpdate = null;
  }
  if (lenis) { lenis.destroy(); lenis = null; }
  document.documentElement.classList.remove('has-motion');
  initialized = false;
}

export function getLenis(): Lenis | null { return lenis; }
export function isReducedMotion(): boolean { return REDUCED_MOTION; }
