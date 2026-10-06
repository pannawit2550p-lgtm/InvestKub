'use client';

import { Children, useRef, useState, type KeyboardEvent, type ReactNode, type UIEvent } from 'react';
import Icon from './Icon';

export default function PortfolioOverviewCarousel({ children, labels }: { children: ReactNode; labels: readonly string[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const cards = Children.toArray(children);

  function showCard(index: number) {
    const track = trackRef.current;
    const target = track?.children.item(index);
    if (!track || !(target instanceof HTMLElement)) return;
    track.scrollTo({
      left: target.offsetLeft,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const track = event.currentTarget;
    let nearest = 0;
    let distance = Infinity;
    Array.from(track.children).forEach((child, index) => {
      if (!(child instanceof HTMLElement)) return;
      const offset = Math.abs(child.offsetLeft - track.scrollLeft);
      if (offset < distance) { nearest = index; distance = offset; }
    });
    setActiveIndex(nearest);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const index = event.key === 'ArrowRight' ? Math.min(cards.length - 1, activeIndex + 1)
      : event.key === 'ArrowLeft' ? Math.max(0, activeIndex - 1)
        : event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : null;
    if (index === null) return;
    event.preventDefault();
    showCard(index);
  }

  return <section className="portfolio-overview-carousel" aria-label="สรุปหุ้นและเงินสด" aria-roledescription="สไลด์">
    <div ref={trackRef} className="portfolio-overview-track" tabIndex={0} aria-label="เลื่อนเพื่อดูมูลค่าหุ้นหรือเงินสด" onScroll={onScroll} onKeyDown={onKeyDown}>
      {cards.map((card, index) => <div className="portfolio-overview-slide" key={labels[index] ?? index} role="group" aria-roledescription="การ์ด" aria-label={`${index + 1} จาก ${cards.length}: ${labels[index] ?? ''}`}>{card}</div>)}
    </div>
    <div className="portfolio-overview-controls">
      <button type="button" className="portfolio-overview-arrow" aria-label="การ์ดก่อนหน้า" disabled={activeIndex === 0} onClick={() => showCard(activeIndex - 1)}><Icon name="arrowLeft" size={18} /></button>
      {cards.map((_, index) => <button type="button" key={index} className={`portfolio-overview-dot${activeIndex === index ? ' is-active' : ''}`} aria-label={`แสดงการ์ด${labels[index] ?? index + 1}`} aria-pressed={activeIndex === index} onClick={() => showCard(index)}><span aria-hidden="true" /></button>)}
      <button type="button" className="portfolio-overview-arrow" aria-label="การ์ดถัดไป" disabled={activeIndex === cards.length - 1} onClick={() => showCard(activeIndex + 1)}><Icon name="arrowRight" size={18} /></button>
    </div>
    <span className="sr-only" aria-live="polite">การ์ด {activeIndex + 1} จาก {cards.length}: {labels[activeIndex]}</span>
  </section>;
}
