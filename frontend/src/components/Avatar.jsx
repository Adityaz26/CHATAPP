const COLORS = [
  "linear-gradient(135deg,#a78bfa,#ec4899)",
  "linear-gradient(135deg,#34d399,#3b82f6)",
  "linear-gradient(135deg,#f97316,#ef4444)",
  "linear-gradient(135deg,#facc15,#f97316)",
  "linear-gradient(135deg,#38bdf8,#6366f1)",
  "linear-gradient(135deg,#e879f9,#6366f1)",
  "linear-gradient(135deg,#4ade80,#22d3ee)",
];

function getColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function Avatar({ name, size = 30 }) {
  return (
    <div className="avatar" style={{ width: size, height: size, background: getColor(name), fontSize: size * 0.43 }}>
      {name?.[0]?.toUpperCase()}
    </div>
  );
}
