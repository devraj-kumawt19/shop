import { useEffect, useRef } from "react";

export default function Reveal({ as: Tag = "section", className = "", children, ...props }) {
  const element = useRef(null);

  useEffect(() => {
    const node = element.current;
    if (!node || !window.IntersectionObserver || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        node.classList.add("is-visible");
        observer.unobserve(node);
      }
    }, { threshold: 0.08 });
    node.classList.add("reveal-ready");
    observer.observe(node);
    return () => {
      observer.disconnect();
      node.classList.remove("reveal-ready", "is-visible");
    };
  }, []);

  return <Tag ref={element} className={`reveal ${className}`} {...props}>{children}</Tag>;
}
