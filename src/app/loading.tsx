export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 animate-pulse">
      <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded-lg w-full max-w-md mb-8" />
      <div className="space-y-4">
        <div className="h-32 bg-slate-200 dark:bg-slate-700 rounded-xl" />
        <div className="h-32 bg-slate-200 dark:bg-slate-700 rounded-xl" />
      </div>
    </div>
  );
}
