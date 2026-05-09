interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
        <span className="text-xl text-gray-500">○</span>
      </div>
      <p className="text-sm font-medium text-gray-300">{title}</p>
      {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
