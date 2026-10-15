export default function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-stone-500 dark:text-stone-400">
      {Icon && <Icon className="mb-1 h-10 w-10 opacity-60" aria-hidden="true" />}
      <div className="text-base font-medium text-stone-700 dark:text-stone-200">{title}</div>
      {text && <div className="max-w-xs text-sm">{text}</div>}
      {action}
    </div>
  );
}
