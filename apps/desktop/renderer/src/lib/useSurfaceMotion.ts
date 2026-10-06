import { useLayoutEffect, useRef } from 'react';

/** Animate an existing surface without remounting editors or losing focus. */
export function useSurfaceMotion<T extends HTMLElement>(key: string, distance = 9) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const surface = ref.current;
    if (!surface || typeof surface.animate !== 'function') return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches) return;
    const animation = surface.animate([
      { opacity: 0.25, transform: `translateY(${distance}px)` },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    surface.dataset.motionState = 'entering';
    const clear = () => { delete surface.dataset.motionState; };
    const onPreference = () => { if (preference.matches) { animation.cancel(); clear(); } };
    animation.onfinish = clear;
    preference.addEventListener('change', onPreference);
    return () => { animation.cancel(); clear(); preference.removeEventListener('change', onPreference); };
  }, [key, distance]);
  return ref;
}
