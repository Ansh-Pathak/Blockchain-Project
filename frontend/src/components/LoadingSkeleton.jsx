export function LoadingSkeleton({ lines = 3, height = "20px" }) {
  return (
    <div className="skeleton-container" aria-busy="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton-bar"
          style={{
            height,
            width: i === lines - 1 && lines > 1 ? "65%" : "100%",
          }}
        />
      ))}
    </div>
  );
}

export function Spinner({ label = "Loading on-chain data..." }) {
  return (
    <div className="spinner-wrapper">
      <div className="spinner-ring" />
      {label && <span className="spinner-label">{label}</span>}
    </div>
  );
}
