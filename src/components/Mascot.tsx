import mascot from "@/assets/mascot.png";

interface Props {
  size?: number;
  className?: string;
  /** Marks the mascot as the LCP image (homepage hero). */
  priority?: boolean;
}

export function Mascot({ size = 96, className = "", priority = false }: Props) {
  return (
    <img
      src={mascot}
      alt="Ton compagnon de voyage"
      width={size}
      height={size}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={`select-none pointer-events-none ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
