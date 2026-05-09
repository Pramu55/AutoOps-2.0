import { clsx } from "clsx";

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        "w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin",
        className
      )}
    />
  );
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Spinner className="w-8 h-8" />
    </div>
  );
}
