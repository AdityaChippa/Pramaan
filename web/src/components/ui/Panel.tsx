import { cn } from "@/lib/utils";

export function Panel({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("panel p-5 md:p-6", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          {title && <h2 className="label-xs">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
