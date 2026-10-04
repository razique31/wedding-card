/**
 * scroll-reveals.ts — Section scroll-triggered reveals
 *
 * Powers all [data-reveal] and [data-parallax] elements.
 * Called by motion-init.ts after Lenis is set up.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function initScrollReveals(): void {
  // ── Fade-up reveals ──────────────────────────────────────────────
  const revealEls = gsap.utils.toArray<HTMLElement>('[data-reveal]');

  revealEls.forEach((el) => {
    // Read optional stagger delay from data attribute
    const delay = parseFloat(el.dataset.revealDelay || '0');

    gsap.fromTo(
      el,
      { autoAlpha: 0, y: 28 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.85,
        delay,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          once: true, // Auto-kill trigger once animated — frees CPU resources
        },
      }
    );
  });

  // ── SVG line draw triggers ───────────────────────────────────────
  const drawEls = gsap.utils.toArray<HTMLElement>('[data-draw]');

  drawEls.forEach((el) => {
    // Simply create ScrollTrigger for all draw elements
    ScrollTrigger.create({
      trigger: el,
      start: 'top 80%',
      onEnter: () => el.classList.add('is-drawn'),
      once: true,
    });
  });

  // ── Parallax depth layers ────────────────────────────────────────
  const parallaxEls = gsap.utils.toArray<HTMLElement>('[data-parallax]');

  parallaxEls.forEach((el) => {
    const speed = parseFloat(el.dataset.parallax || '0.08');
    // Clamp to safe range — max 15% viewport movement to avoid over-parallax
    const clampedSpeed = Math.max(-0.15, Math.min(0.15, speed));
    const yRange = window.innerHeight * Math.abs(clampedSpeed) * 0.5;

    gsap.fromTo(
      el,
      { y: -yRange },
      {
        y: yRange,
        ease: 'none',
        force3D: true,
        scrollTrigger: {
          trigger: el,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1, // 1s smooth catch-up prevents micro-stutter
        },
      }
    );
  });
}
