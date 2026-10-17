interface Props {
  error: string;
  onDismiss: () => void;
}

export function ErrorBanner({ error, onDismiss }: Props) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <span className="flex-1">{error}</span>
      <button type="button" onClick={onDismiss} className="font-medium hover:underline">
        dismiss
      </button>
    </div>
  );
}
