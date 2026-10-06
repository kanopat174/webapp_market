import { useEffect, useRef, useState } from "react";

export const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Keep an element mounted long enough to play its exit animation.
 * Returns { mounted, closing }: render while mounted, add the closing class while closing.
 */
export function usePresence(open, ms = 220) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return; }
    if (!mounted) return;
    if (reducedMotion()) { setMounted(false); return; }
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, ms);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return { mounted, closing };
}

/**
 * Scroll reveal for everything marked data-reveal inside the root, including elements
 * React adds later. Content is only hidden once the observer is running, so nothing
 * stays invisible if scripts or IntersectionObserver are unavailable.
 */
export function useRevealRoot(ref) {
  useEffect(() => {
    const root = ref.current;
    if (!root || !("IntersectionObserver" in window) || reducedMotion()) return;
    document.documentElement.classList.add("can-reveal");
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      }
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
    const scan = (node) => {
      if (!(node instanceof Element)) return;
      if (node.matches("[data-reveal]:not(.in)")) io.observe(node);
      node.querySelectorAll?.("[data-reveal]:not(.in)").forEach((el) => io.observe(el));
    };
    scan(root);
    const mo = new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach(scan)));
    mo.observe(root, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [ref]);
}

/** Fly a copy of the product picture into the cart button, then bump the badge. */
export function flyToCart(fromEl) {
  const target = document.getElementById("cart-button");
  if (!target) return;
  const bump = () => {
    target.classList.remove("bump");
    void target.offsetWidth; // restart the animation
    target.classList.add("bump");
  };
  if (!fromEl || reducedMotion() || !target.animate) { bump(); return; }
  const a = fromEl.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const ghost = fromEl.cloneNode(true);
  Object.assign(ghost.style, {
    position: "fixed", left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`,
    margin: 0, zIndex: 80, pointerEvents: "none", borderRadius: "16px",
  });
  document.body.appendChild(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = ghost.animate([
    { transform: "translate(0,0) scale(1)", opacity: 1 },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.35 - 60}px) scale(.55)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(.12)`, opacity: 0.2 },
  ], { duration: 720, easing: "cubic-bezier(.5,0,.3,1)" });
  anim.onfinish = () => { ghost.remove(); bump(); };
}

/** A short burst of confetti, drawn on a temporary canvas. */
export function confetti({ count = 140, colors = ["#1f6b57", "#e2a03a", "#4fb895", "#f6c56a", "#d0607a"] } = {}) {
  if (reducedMotion()) return;
  const c = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  Object.assign(c.style, { position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 90 });
  document.body.appendChild(c);
  const ctx = c.getContext("2d");
  ctx.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 13 - 4,
    w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  const tick = (now) => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (now - start < 2600) requestAnimationFrame(tick); else c.remove();
  };
  requestAnimationFrame(tick);
}

/** Animate a number from 0 to value when it first renders. */
export function useCountUp(value, ms = 900) {
  const [n, setN] = useState(reducedMotion() ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reducedMotion()) { setN(value); return; }
    const start = performance.now();
    const base = from.current;
    let raf;
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(base + (value - base) * eased));
      if (t < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return n;
}
