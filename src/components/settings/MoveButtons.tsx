interface Props {
  index: number;
  count: number;
  /** Names the entry in the buttons' accessible labels. */
  name: string;
  onMove(from: number, to: number): void;
}

export function MoveButtons({ index, count, name, onMove }: Props) {
  return (
    <>
      <button
        type="button"
        className="btn btn-sm"
        aria-label={`Move ${name} up`}
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="btn btn-sm"
        aria-label={`Move ${name} down`}
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
      >
        ↓
      </button>
    </>
  );
}
