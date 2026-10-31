import "./brand.css";

export default function Brand({ name = "LUXE CARTS" }) {
  return <span className="luxe-brand"><img className="luxe-brand-mark" src="/brand-mark.svg" alt="" aria-hidden="true" /><span className="luxe-brand-wordmark">{name === "LUXE CARTS" ? <><strong>LUXE</strong><span>CARTS</span></> : <strong>{name}</strong>}</span></span>;
}
