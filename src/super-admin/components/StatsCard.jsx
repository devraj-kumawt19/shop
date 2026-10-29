export default function StatsCard({ label, value, caption, icon: Icon }) {
  return <div><span className="stat-icon"><Icon size={19} /></span><small>{label}</small><strong>{value}</strong><p>{caption}</p></div>;
}
