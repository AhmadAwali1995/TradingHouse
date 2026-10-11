export function ReportLoader({ label }: { label: string }) {
  return (
    <p className="report__status report__loader" role="status">
      <span className="report__spinner" aria-hidden="true" />
      {label}
    </p>
  )
}
