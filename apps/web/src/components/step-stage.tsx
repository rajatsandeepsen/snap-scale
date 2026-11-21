import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

type Layer = { id: string; node: ReactNode };

/** Shows one card at a time: the new card animates in while the previous one fades out. */
export function StepStage({ id, children }: { id: string; children: ReactNode }) {
  const last = useRef<Layer | null>(null);
  const [leaving, setLeaving] = useState<Layer | null>(null);

  useLayoutEffect(() => {
    if (last.current && last.current.id !== id) setLeaving(last.current);
    last.current = { id, node: children };
  });
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(null), 280);
    return () => clearTimeout(t);
  }, [leaving]);

  return (
    <div className="grid w-full place-items-center *:[grid-area:1/1]">
      {leaving && (
        <div
          key={`leaving-${leaving.id}`}
          aria-hidden
          className="animate-out fade-out slide-out-to-top-6 zoom-out-95 pointer-events-none w-full duration-300"
        >
          {leaving.node}
        </div>
      )}
      <div
        key={id}
        className="animate-in fade-in slide-in-from-bottom-6 zoom-in-95 w-full delay-100 duration-500 fill-mode-backwards"
      >
        {children}
      </div>
    </div>
  );
}

export function StepCard({
  step,
  title,
  children,
  wide = false,
}: {
  step?: number;
  title: ReactNode;
  children?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`mx-auto grid w-full gap-4 rounded-3xl border border-neutral-200 bg-white p-5 sm:p-6 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.18)] ${wide ? "max-w-2xl" : "max-w-md"}`}
    >
      <div className="grid gap-1">
        {step && (
          <span className="text-xs font-medium tracking-wide text-neutral-400 uppercase">
            Step {step} of 5
          </span>
        )}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}
