/**
 * envelope-animation.ts — Envelope opening GSAP timeline
 * 
 * Creates the physical envelope opening illusion using:
 * - CSS perspective + rotateX for flap
 * - y transforms for card emergence
 * - scale for camera zoom effect
 * - autoAlpha for clean layering
 * 
 * Fallbacks:
 * - prefers-reduced-motion: instant fade (0.3s)
 * - sessionStorage: skip on revisit
 * - JS failure: skip link in HTML always works
 * - GSAP failure: try/catch, falls through to showing invitation
 */

import { gsap } from 'gsap';
import { initHeroAnimation } from './hero-animation';
import { initMotion } from './motion-init';

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Initialize the envelope experience.
 * Called on page load.
 */
export function initEnvelope(): void {
  const envelope = document.getElementById('envelope');
  const invitation = document.getElementById('invitation');
  const openBtn = document.getElementById('open-invitation-btn');
  const skipBtn = document.getElementById('skip-envelope');

  if (!envelope || !invitation) {
    // Elements missing — show invitation directly
    if (invitation) invitation.style.display = 'block';
    return;
  }

  // Check if already opened this session
  if (sessionStorage.getItem('envelope-opened')) {
    skipToInvitation(envelope, invitation);
    return;
  }

  // If reduced motion, show simple fade
  if (REDUCED_MOTION) {
    openBtn?.addEventListener('click', () => {
      quickTransition(envelope, invitation);
    });
    skipBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      quickTransition(envelope, invitation);
    });
    return;
  }

  // Full GSAP envelope animation
  openBtn?.addEventListener('click', () => {
    try {
      playEnvelopeAnimation(envelope, invitation);
    } catch (error) {
      console.error('Envelope animation failed:', error);
      quickTransition(envelope, invitation);
    }
  });

  skipBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    quickTransition(envelope, invitation);
  });
}

/**
 * Instantly show invitation (no animation).
 * Used for session revisits.
 */
function skipToInvitation(envelope: HTMLElement, invitation: HTMLElement): void {
  envelope.style.display = 'none';
  invitation.style.display = 'block';
  
  // Initialize motion system for scroll animations
  requestAnimationFrame(() => {
    initMotion();
  });
}

/**
 * Quick fade transition (reduced motion or fallback).
 */
function quickTransition(envelope: HTMLElement, invitation: HTMLElement): void {
  sessionStorage.setItem('envelope-opened', 'true');

  gsap.to(envelope, {
    autoAlpha: 0,
    duration: 0.3,
    ease: 'power2.out',
    onComplete: () => {
      envelope.style.display = 'none';
      invitation.style.display = 'block';

      gsap.fromTo(invitation,
        { autoAlpha: 0 },
        {
          autoAlpha: 1,
          duration: 0.4,
          ease: 'power2.out',
          onComplete: () => {
            initMotion();
          },
        }
      );
    },
  });
}

/**
 * Full cinematic envelope opening sequence.
 */
function playEnvelopeAnimation(envelope: HTMLElement, invitation: HTMLElement): void {
  const body = document.getElementById('envelope-body');
  const flap = document.getElementById('envelope-flap');
  const seal = document.getElementById('envelope-seal');
  const card = document.getElementById('envelope-card');
  const openBtn = document.getElementById('open-invitation-btn');

  if (!body || !flap || !seal || !card) {
    quickTransition(envelope, invitation);
    return;
  }

  sessionStorage.setItem('envelope-opened', 'true');

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    onComplete: () => {
      // Clean up envelope DOM after animation
      envelope.style.display = 'none';
      // Initialize scroll animations
      initMotion();
    },
  });

  // Step 1: Button fades out
  if (openBtn) {
    tl.to(openBtn, {
      autoAlpha: 0,
      y: -10,
      duration: 0.3,
      ease: 'power2.out',
    }, 0);
  }

  // Also fade the skip link and name preview
  tl.to('#skip-envelope', {
    autoAlpha: 0,
    duration: 0.2,
  }, 0);

  tl.to(envelope.querySelectorAll('.mt-8.text-center'), {
    autoAlpha: 0,
    duration: 0.2,
  }, 0);

  // Step 2: Subtle camera zoom toward envelope
  tl.to(body, {
    scale: 1.04,
    duration: 0.6,
    ease: 'power3.inOut',
  }, 0.2);

  // Step 3: Wax seal fades and scales away
  tl.to(seal, {
    autoAlpha: 0,
    scale: 1.3,
    duration: 0.4,
    ease: 'power3.out',
  }, 0.5);

  // Step 4: Envelope flap rotates open (CSS perspective on parent)
  tl.to(flap, {
    rotateX: 180,
    duration: 0.7,
    ease: 'power3.inOut',
  }, 0.8);

  // Step 5: Inner card slides upward and scales up
  tl.to(card, {
    y: -40,
    scale: 1.05,
    duration: 0.7,
    ease: 'power4.out',
  }, 1.2);

  // Step 6: Entire envelope fades while invitation appears
  tl.to(envelope, {
    autoAlpha: 0,
    scale: 1.05,
    duration: 0.5,
    ease: 'power3.out',
    onStart: () => {
      // Show invitation before envelope fully fades
      invitation.style.display = 'block';
      invitation.style.opacity = '0';
    },
  }, 1.7);

  // Step 7: Invitation fades in
  tl.to(invitation, {
    opacity: 1,
    duration: 0.6,
    ease: 'power2.out',
  }, 1.9);

  // Step 8: Hero entrance animation
  tl.add(() => {
    initHeroAnimation();
  }, 2.2);
}
