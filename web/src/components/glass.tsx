"use client";
import Image from "next/image";
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
const paths: Record<string, string> = {
  cloud: "M7 18a4 4 0 010-8 5.5 5.5 0 0110.6 1.2A3.4 3.4 0 0117 18z",
  arrow: "M4 12h15m-6-6 6 6-6 6",
  wallet: "M4 6h15v14H4V6Zm0 0V3h13v3m-2 5h6v5h-6v-5Z",
  shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-4 9 3 3 5-6",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z",
  database:
    "M4 6c0-4 16-4 16 0s-16 4-16 0Zm0 0v12c0 4 16 4 16 0V6M4 12c0 4 16 4 16 0",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  play: "m8 5 11 7-11 7V5Z",
  lock: "M5 10h14v11H5V10Zm3 0V6a4 4 0 0 1 8 0v4m-4 5v2",
  globe:
    "M2 12h20M12 2c6 5 6 15 0 20-6-5-6-15 0-20Zm10 10a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  activity: "M2 12h5l3-8 4 16 3-8h5",
  chevron: "m7 9 5 5 5-5",
  external: "M14 3h7v7m0-7L10 14M10 3H3v18h18v-7",
  info: "M12 11v6m0-10v1m10 4a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  up: "M12 20V4m-6 6 6-6 6 6",
  down: "M12 4v16m-6-6 6 6 6-6",
  code: "m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18",
};
export function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.spark} />
    </svg>
  );
}
export function Brand({
  compact = false,
  priority = false,
  imageSizes = "44px",
}: {
  compact?: boolean;
  priority?: boolean;
  imageSizes?: string;
}) {
  const hintedSize = Number.parseInt(imageSizes, 10);
  const intrinsicSize =
    Number.isFinite(hintedSize) && hintedSize >= 32 && hintedSize <= 256
      ? hintedSize
      : 44;
  return (
    <span className="brand">
      <span className="brand-mark">
        <Image
          src="/brand/earmark-crystal.png"
          alt={compact ? "Earmark PayPal" : ""}
          width={intrinsicSize}
          height={intrinsicSize}
          preload={priority}
          className="brand-crystal"
        />
      </span>
      {!compact && "Earmark PayPal"}
    </span>
  );
}
export function Panel({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`glass ${className}`}>
      {children}
    </section>
  );
}
export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "soft" | "ghost";
}) {
  return (
    <button
      type="button"
      className={`button ${variant} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="status-dot" />
      {children}
    </span>
  );
}
export function PanelTitle({
  icon,
  children,
  action,
}: {
  icon: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="panel-title">
      <span className="icon-tile">
        <Icon name={icon} />
      </span>
      <h2>{children}</h2>
      {action && <span className="title-action">{action}</span>}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
export function Tooltip({ text }: { text: string }) {
  return (
    <span className="tooltip">
      <button type="button" className="info-button" aria-label={text}>
        <Icon name="info" />
      </button>
      <span role="tooltip">{text}</span>
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="glass modal"
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Robot() {
  return (
    <div className="robot" aria-hidden="true">
      <div className="robot-aura" />
      <div className="robot-head">
        <i />
        <i />
      </div>
      <div className="robot-body" />
      <span className="robot-ear left" />
      <span className="robot-ear right" />
    </div>
  );
}
export function ContractArt() {
  return (
    <div className="contract-art" aria-hidden="true">
      <div className="document">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="contract-diamond">
        <Icon name="shield" />
      </div>
    </div>
  );
}
