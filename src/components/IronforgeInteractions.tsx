"use client";

import { useEffect } from "react";

/**
 * Wires up the IRONFORGE design behaviors by querying the rendered markup.
 * Mirrors the original single <script> block but as a React effect.
 */
export default function IronforgeInteractions() {
  useEffect(() => {
    /* ---------- HERO REEL ---------- */
    const frames = Array.from(document.querySelectorAll<HTMLElement>(".reel-frame"));
    const chapterNum = document.getElementById("chapterNum");
    const reelProgress = document.getElementById("reelProgress");
    let currentFrame = 0;
    const frameDuration = 5000;
    let frameTimer = 0;

    const showFrame = (idx: number) => {
      frames.forEach((f, i) => f.classList.toggle("active", i === idx));
      if (chapterNum) chapterNum.textContent = String(idx + 1).padStart(2, "0");
    };

    const tickReel = () => {
      frameTimer += 50;
      const pct = (frameTimer / frameDuration) * 100;
      if (reelProgress) reelProgress.style.width = pct + "%";
      if (frameTimer >= frameDuration) {
        frameTimer = 0;
        currentFrame = (currentFrame + 1) % frames.length;
        showFrame(currentFrame);
      }
      requestAnimationFrame(tickReel);
    };
    if (frames.length) requestAnimationFrame(tickReel);

    /* ---------- MUTE TOGGLE ---------- */
    const muteToggle = document.getElementById("muteToggle");
    const muteLabel = document.getElementById("muteLabel");
    const muteIcon = document.getElementById("muteIcon");
    let muted = true;
    muteToggle?.addEventListener("click", () => {
      muted = !muted;
      muteToggle.classList.toggle("unmuted", !muted);
      if (muteLabel) muteLabel.textContent = muted ? "Muted" : "Sound On";
      if (muteIcon) {
        muteIcon.className = muted
          ? "fas fa-volume-xmark text-xs text-[var(--muted)] group-hover:text-[var(--accent)]"
          : "fas fa-volume-high text-xs text-[var(--accent)]";
      }
    });

    /* ---------- REVEAL ON SCROLL ---------- */
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );
    document.querySelectorAll(".reveal, .reveal-stagger").forEach((el) => revealObserver.observe(el));

    /* ---------- NUMBER COUNTERS ---------- */
    const counters = document.querySelectorAll<HTMLElement>(".number-display");
    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const target = parseInt(el.dataset.count || "0", 10);
            const duration = 1800;
            const start = performance.now();
            const step = (now: number) => {
              const elapsed = now - start;
              const progress = Math.min(elapsed / duration, 1);
              const eased = 1 - Math.pow(1 - progress, 3);
              const value = Math.floor(eased * target);
              el.textContent = value.toLocaleString() + (target >= 1000 ? "+" : "");
              if (progress < 1) requestAnimationFrame(step);
              else el.textContent = target.toLocaleString() + (target >= 1000 ? "+" : "");
            };
            requestAnimationFrame(step);
            counterObserver.unobserve(el);
          }
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((c) => counterObserver.observe(c));

    /* ---------- COACH FLIP (touch) ---------- */
    document.querySelectorAll<HTMLElement>(".flip-card").forEach((card) => {
      card.addEventListener("click", () => {
        if (window.matchMedia("(hover: none)").matches) card.classList.toggle("flipped");
      });
    });

    /* ---------- STICKY CTA ---------- */
    const stickyCta = document.getElementById("stickyCta");
    const heroSection = document.getElementById("hero");
    const bookingSection = document.getElementById("booking");
    const stickyObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === heroSection) {
            const showSticky = !entry.isIntersecting;
            const bookingRect = bookingSection?.getBoundingClientRect();
            const atBooking =
              bookingRect && bookingRect.top < window.innerHeight && bookingRect.bottom > 0;
            stickyCta?.classList.toggle("visible", showSticky && !atBooking);
          }
        });
      },
      { threshold: 0 }
    );
    if (heroSection) stickyObserver.observe(heroSection);
    if (bookingSection) stickyObserver.observe(bookingSection);

    /* ---------- GOAL SELECTORS ---------- */
    const wirePills = (scope: string) => {
      document.querySelectorAll(`${scope} .goal-pill`).forEach((pill) => {
        pill.addEventListener("click", () => {
          document.querySelectorAll(`${scope} .goal-pill`).forEach((p) => p.classList.remove("active"));
          pill.classList.add("active");
        });
      });
    };
    wirePills("#goalSelector");
    wirePills("#curriculum");

    /* ---------- BOOKING FORM -> TOAST ---------- */
    const bookingForm = document.getElementById("bookingForm") as HTMLFormElement | null;
    const toast = document.getElementById("toast");
    const toastTitle = document.getElementById("toastTitle");
    const toastMsg = document.getElementById("toastMsg");
    let toastTimer: number | undefined;
    bookingForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (toastTitle) toastTitle.textContent = "Trial request received";
      if (toastMsg)
        toastMsg.textContent = "A coach will reach out within 24 hours to confirm your session.";
      toast?.classList.add("visible");
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast?.classList.remove("visible"), 4500);
      bookingForm.reset();
      document
        .querySelectorAll("#goalSelector .goal-pill")
        .forEach((p, i) => p.classList.toggle("active", i === 0));
    });

    /* ---------- STORIES CAROUSEL ---------- */
    class StoriesCarousel {
      track: HTMLElement;
      cards: HTMLElement[];
      currentIndex = 0;
      isDown = false;
      startX = 0;
      startOffset = 0;
      currentX = 0;
      velocity = 0;
      lastX = 0;
      lastTime = 0;
      cardWidth = 0;
      maxScroll = 0;
      autoAdvance = true;
      autoAdvanceInterval = 4500;
      autoTimer: number | null = null;
      pauseAuto = false;

      constructor(track: HTMLElement) {
        this.track = track;
        this.cards = Array.from(track.children) as HTMLElement[];
        this.init();
      }

      init() {
        this.calculateDimensions();
        this.bindEvents();
        this.buildDots();
        this.startAuto();
        window.addEventListener("resize", () => {
          this.calculateDimensions();
          this.clamp();
          this.applyTransform(0);
        });
      }

      calculateDimensions() {
        if (this.cards.length === 0) return;
        const trackStyle = window.getComputedStyle(this.track);
        const gap = parseFloat(trackStyle.gap) || 24;
        const paddingLeft = parseFloat(trackStyle.paddingLeft) || 32;
        this.cardWidth = this.cards[0].offsetWidth + gap;
        const containerWidth = this.track.parentElement?.offsetWidth || window.innerWidth;
        const totalWidth = this.cards.length * this.cardWidth - gap + paddingLeft * 2;
        this.maxScroll = Math.max(0, totalWidth - containerWidth);
      }

      bindEvents() {
        const down = (e: Event) => this.handleDown(e as MouseEvent | TouchEvent);
        const move = (e: Event) => this.handleMove(e as MouseEvent | TouchEvent);
        const up = () => this.handleUp();
        this.track.addEventListener("mousedown", down);
        this.track.addEventListener("touchstart", down, { passive: true } as AddEventListenerOptions);
        window.addEventListener("mousemove", move);
        window.addEventListener("touchmove", move, { passive: false } as AddEventListenerOptions);
        window.addEventListener("mouseup", up);
        window.addEventListener("touchend", up);
        window.addEventListener("touchcancel", up);
        this.track.addEventListener("mouseenter", () => (this.pauseAuto = true));
        this.track.addEventListener("mouseleave", () => (this.pauseAuto = false));
        document.getElementById("storyPrev")?.addEventListener("click", () => this.goTo(this.currentIndex - 1));
        document.getElementById("storyNext")?.addEventListener("click", () => this.goTo(this.currentIndex + 1));
      }

      getX(e: MouseEvent | TouchEvent) {
        return e.type.includes("touch") ? (e as TouchEvent).touches[0].pageX : (e as MouseEvent).pageX;
      }

      handleDown(e: MouseEvent | TouchEvent) {
        this.isDown = true;
        this.track.classList.add("dragging");
        this.startX = this.getX(e);
        this.startOffset = this.currentX;
        this.lastX = this.startX;
        this.lastTime = Date.now();
        this.velocity = 0;
        this.stopAuto();
      }

      handleMove(e: MouseEvent | TouchEvent) {
        if (!this.isDown) return;
        if ((e as TouchEvent).cancelable) e.preventDefault();
        const x = this.getX(e);
        const delta = x - this.startX;
        let newX = this.startOffset + delta;
        if (newX > 0) newX = newX * 0.35;
        else if (newX < -this.maxScroll) {
          const over = newX + this.maxScroll;
          newX = -this.maxScroll + over * 0.35;
        }
        const now = Date.now();
        const dt = now - this.lastTime;
        if (dt > 0) this.velocity = (x - this.lastX) / dt;
        this.lastX = x;
        this.lastTime = now;
        this.currentX = newX;
        this.applyTransform(0);
      }

      handleUp() {
        if (!this.isDown) return;
        this.isDown = false;
        this.track.classList.remove("dragging");
        const target = this.currentX + this.velocity * 300;
        const snapIndex = Math.round(Math.abs(target) / this.cardWidth);
        const clampedIndex = Math.max(0, Math.min(this.cards.length - 1, snapIndex));
        let snappedX = -clampedIndex * this.cardWidth;
        if (snappedX > 0) snappedX = 0;
        if (snappedX < -this.maxScroll) snappedX = -this.maxScroll;
        this.currentX = snappedX;
        this.currentIndex = clampedIndex;
        this.applyTransform(700);
        this.updateDots();
        window.setTimeout(() => this.startAuto(), 1500);
      }

      goTo(idx: number) {
        this.currentIndex = Math.max(0, Math.min(this.cards.length - 1, idx));
        let target = -this.currentIndex * this.cardWidth;
        if (target > 0) target = 0;
        if (target < -this.maxScroll) target = -this.maxScroll;
        this.currentX = target;
        this.applyTransform(700);
        this.updateDots();
        this.stopAuto();
        window.setTimeout(() => this.startAuto(), 2000);
      }

      clamp() {
        if (this.currentX > 0) this.currentX = 0;
        if (this.currentX < -this.maxScroll) this.currentX = -this.maxScroll;
      }

      applyTransform(duration = 0) {
        this.track.style.transition =
          duration > 0 ? `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)` : "none";
        this.track.style.transform = `translateX(${this.currentX}px)`;
      }

      buildDots() {
        const dotsContainer = document.getElementById("storyDots");
        if (!dotsContainer) return;
        dotsContainer.innerHTML = "";
        this.cards.forEach((_, i) => {
          const dot = document.createElement("button");
          dot.className = "story-dot transition-all";
          dot.style.cssText =
            i === 0
              ? "width:32px;height:2px;background:var(--accent);"
              : "width:8px;height:2px;background:var(--border-light);";
          dot.addEventListener("click", () => this.goTo(i));
          dotsContainer.appendChild(dot);
        });
      }

      updateDots() {
        const dots = document.querySelectorAll<HTMLElement>("#storyDots button");
        dots.forEach((dot, i) => {
          dot.style.cssText =
            i === this.currentIndex
              ? "width:32px;height:2px;background:var(--accent);transition:all 0.4s;"
              : "width:8px;height:2px;background:var(--border-light);transition:all 0.4s;";
        });
      }

      startAuto() {
        if (!this.autoAdvance) return;
        this.stopAuto();
        this.autoTimer = window.setInterval(() => {
          if (this.pauseAuto || this.isDown) return;
          let next = this.currentIndex + 1;
          if (next >= this.cards.length) next = 0;
          this.goTo(next);
        }, this.autoAdvanceInterval);
      }

      stopAuto() {
        if (this.autoTimer) {
          clearInterval(this.autoTimer);
          this.autoTimer = null;
        }
      }
    }

    const storyTrack = document.getElementById("storyTrack");
    if (storyTrack) new StoriesCarousel(storyTrack);

    /* ---------- GRAIN PARALLAX ---------- */
    const grain = document.getElementById("grain");
    let targetGrainY = 0;
    let currentGrainY = 0;
    window.addEventListener(
      "scroll",
      () => {
        targetGrainY = window.scrollY * 0.15;
      },
      { passive: true }
    );
    const animateGrain = () => {
      currentGrainY += (targetGrainY - currentGrainY) * 0.08;
      if (grain) grain.style.transform = `translateY(${currentGrainY}px)`;
      requestAnimationFrame(animateGrain);
    };
    animateGrain();

    /* ---------- HERO PARALLAX ---------- */
    const reelContainer = document.getElementById("reelContainer");
    window.addEventListener(
      "scroll",
      () => {
        const scrolled = window.scrollY;
        if (scrolled < window.innerHeight && reelContainer) {
          reelContainer.style.transform = `translateY(${scrolled * 0.3}px)`;
        }
      },
      { passive: true }
    );

    return () => {
      revealObserver.disconnect();
      counterObserver.disconnect();
      stickyObserver.disconnect();
    };
  }, []);

  return null;
}
