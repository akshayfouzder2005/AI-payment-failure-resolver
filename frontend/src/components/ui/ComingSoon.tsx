export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h1 className="mb-2 text-heading">{title}</h1>
      <p className="max-w-md text-sm text-text-muted">{note}</p>
    </div>
  );
}
