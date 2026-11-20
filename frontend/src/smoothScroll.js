import { useEffect } from 'react';

/**
 * Makes mouse-wheel scrolling inside an element glide instead of jumping.
 * Each wheel tick moves a "target" position; every frame the list moves 18% of the
 * remaining distance toward it, so it eases out smoothly. Turned off for people who
 * asked their system for reduced motion.
 */
export function useSmoothWheel(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

    let current = el.scrollTop;
    let target = el.scrollTop;
    let frame = null;

    const maxScroll = () => el.scrollHeight - el.clientHeight;

    const step = () => {
      const remaining = target - current;
      if (Math.abs(remaining) < 0.5) {
        current = target;
        el.scrollTop = target;
        frame = null;
        return;
      }
      current += remaining * 0.18;
      el.scrollTop = current;
      frame = requestAnimationFrame(step);
    };

    const onWheel = (e) => {
      if (e.ctrlKey || maxScroll() <= 0) return; // Ctrl+wheel = zoom; nothing to scroll
      // deltaMode: 0 = pixels (touchpads), 1 = lines (most mice), 2 = pages
      const delta = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * el.clientHeight : e.deltaY;
      if (frame === null) current = target = el.scrollTop;
      target = Math.max(0, Math.min(maxScroll(), target + delta));
      e.preventDefault();
      if (frame === null) frame = requestAnimationFrame(step);
    };

    // Keyboard, touch or dragging also scroll the list: start the next glide from there
    const onScroll = () => {
      if (frame === null) current = target = el.scrollTop;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('scroll', onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [ref]);
}
