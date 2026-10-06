'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type RefObject } from 'react';
import Icon from './Icon';

interface OrderConfirmationModalProps {
  open: boolean;
  submitting: boolean;
  side: 'buy' | 'sell';
  symbol: string;
  orderType: 'market' | 'limit';
  quantity: string;
  price: string;
  priceTimeLabel?: string;
  fee: string;
  total: string;
  error?: string;
  warning?: string;
  confirmLabel: string;
  returnFocusRef: RefObject<HTMLButtonElement>;
  onClose: () => void;
  onConfirm: () => void;
}

const EXIT_DURATION_MS = 200;

export default function OrderConfirmationModal({
  open,
  submitting,
  side,
  symbol,
  orderType,
  quantity,
  price,
  priceTimeLabel,
  fee,
  total,
  error,
  warning,
  confirmLabel,
  returnFocusRef,
  onClose,
  onConfirm,
}: OrderConfirmationModalProps) {
  const [mounted, setMounted] = useState(false);
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasRenderedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);

    if (open) {
      setRendered(true);
      setClosing(false);
      return;
    }

    if (rendered) {
      setClosing(true);
      closeTimerRef.current = setTimeout(() => {
        setRendered(false);
        setClosing(false);
      }, EXIT_DURATION_MS);
    }
  }, [open, rendered]);

  useEffect(() => {
    if (!rendered) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [rendered]);

  useEffect(() => {
    if (!open || !rendered) return;
    const frame = requestAnimationFrame(() => confirmButtonRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, rendered]);

  useEffect(() => {
    if (rendered) {
      wasRenderedRef.current = true;
      return;
    }
    if (wasRenderedRef.current) {
      returnFocusRef.current?.focus();
      wasRenderedRef.current = false;
    }
  }, [rendered, returnFocusRef]);

  useEffect(() => {
    if (!open || !rendered) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!submitting) onClose();
        return;
      }

      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));

      if (!focusable.length) {
        event.preventDefault();
        modalRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open, rendered, submitting]);

  if (!mounted || !rendered) return null;

  const requestClose = () => {
    if (!submitting) onClose();
  };

  return createPortal(
    <div
      className={`order-confirmation-backdrop ${closing ? 'is-closing' : 'is-opening'}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={modalRef}
        className="order-confirmation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-confirmation-title"
        aria-busy={submitting}
        tabIndex={-1}
      >
        <header className="order-confirmation-header">
          <button
            className="order-confirmation-back"
            type="button"
            onClick={requestClose}
            disabled={submitting}
            aria-label="ย้อนกลับ"
          >
            <Icon name="arrowLeft" size={24} />
          </button>
          <h2 id="order-confirmation-title">ตรวจสอบคำสั่ง</h2>
        </header>

        <p className="order-confirmation-kind">
          {side === 'buy' ? 'ซื้อ' : 'ขาย'} {symbol} · {orderType === 'market' ? 'ราคาตลาด' : 'ตั้งราคาเอง'}
        </p>

        <div className="order-confirmation-summary">
          <div><span>จำนวนหุ้น</span><strong>{quantity}</strong></div>
          <div><span>ราคา</span><strong>{price}{priceTimeLabel && <small className="order-confirmation-price-time">{priceTimeLabel}</small>}</strong></div>
          <div><span>ค่าธรรมเนียมโดยประมาณ</span><strong>{fee}</strong></div>
          <div><span>{side === 'buy' ? 'ยอดรวม' : 'ยอดรับโดยประมาณ'}</span><strong>{total}</strong></div>
        </div>

        {warning && <p className="order-confirmation-warning" role="status">{warning}</p>}
        {error && <p className="order-confirmation-error" role="alert">{error}</p>}

        <button
          ref={confirmButtonRef}
          className={`order-confirmation-submit ${side === 'sell' ? 'sell' : 'buy'}`}
          type="button"
          disabled={submitting}
          onClick={onConfirm}
        >
          {submitting && <span className="order-confirmation-spinner" aria-hidden="true" />}
          <span>{submitting ? 'กำลังส่งคำสั่ง…' : confirmLabel}</span>
        </button>

        <button
          className="order-confirmation-edit"
          type="button"
          disabled={submitting}
          onClick={requestClose}
        >
          แก้ไข
        </button>

        <p className="order-confirmation-disclaimer">คำสั่งนี้เป็นการจำลองด้วยเงินสมมติเท่านั้น</p>
      </div>
    </div>,
    document.body,
  );
}
