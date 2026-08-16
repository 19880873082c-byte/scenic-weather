export function ScoreRing({ score, size = "large" }: { score: number; size?: "small" | "large" }) {
  const radius = size === "large" ? 50 : 23;
  const stroke = size === "large" ? 8 : 5;
  const dimension = size === "large" ? 124 : 58;
  const circumference = 2 * Math.PI * radius;
  const color = score >= 80 ? "#09a98f" : score >= 65 ? "#f0a43c" : "#e0655b";
  return (
    <div className={`score-ring ${size}`} style={{ width: dimension, height: dimension }} aria-label={`观景指数 ${score} 分`}>
      <svg viewBox={`0 0 ${dimension} ${dimension}`} role="img">
        <circle cx={dimension / 2} cy={dimension / 2} r={radius} fill="none" stroke="rgba(15,55,58,.09)" strokeWidth={stroke} />
        <circle cx={dimension / 2} cy={dimension / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - score / 100)} transform={`rotate(-90 ${dimension / 2} ${dimension / 2})`} />
      </svg>
      <div className="score-value"><strong>{score}</strong>{size === "large" && <span>观景指数</span>}</div>
    </div>
  );
}
